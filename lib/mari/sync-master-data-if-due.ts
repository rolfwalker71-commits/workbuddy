/**
 * Scheduler-Eintrag: Vertragsstammdaten als Vollabzug in den lokalen Cache.
 *
 * Läuft einmal für alle, nicht pro Benutzer — Verträge und Positionen sind in
 * MARI nicht personenbezogen (gemessen: `/ProjectListContracts/{pn}/false`
 * liefert jedem dieselben Zeilen). Der REST-Login ist ohnehin gemeinsam
 * (`MARI_REST_USERNAME`/`PASSWORD`), pro Benutzer unterscheidet sich nur die
 * Personalnummer — die zählt hier nicht, wird aber gebraucht, damit
 * `resolveMariConfigForUser` überhaupt eine Konfiguration zurückgibt.
 *
 * Die Projektliste ist der Gegenfall: sie bleibt personenbezogen und wird darum
 * pro Mitarbeiter aufgefrischt, aber deutlich seltener.
 */

import { getSetting, setSetting } from "@/lib/db/migrations";
import { mariSql } from "@/lib/mari/client";
import {
  replaceMariMasterData,
  getMariMasterDataState,
} from "@/lib/mari/contract-cache";
import {
  mariFlagIsTrue,
  mariPositionIsBookable,
  type MariContractRow,
  type MariContractPositionRow,
} from "@/lib/mari/contract-cache-shared";
import {
  projectListNeedsRefresh,
  writeCachedProjectList,
} from "@/lib/mari/project-list-cache";
import { resolveMariConfigForUser } from "@/lib/mari/settings";
import { runWithMariUser } from "@/lib/mari/request-context";
import { listActiveUsersWithModule } from "@/lib/users/queries";

export const MARI_MASTER_SYNC_INTERVAL_MS = 30 * 60 * 1000;

const LAST_SYNC_KEY = "mari_master_data_last_sync_at";

/** Ein Statement, kein Semikolon — so verlangt es der Guard in `mariSql`. */
const CONTRACTS_SQL = `SELECT "ContractID", "ContractNumber", "ProjectNumber",
  "Description", "Company", "Inactive"
FROM "MARIContract"`;

/**
 * Nur bebuchbare Positionen. Das `WHERE` spiegelt exakt, was
 * `/api/ContractListPositionsForTimeKeeping/{id}` anbietet — siehe
 * `mariPositionIsBookable`. Die Filterung zusätzlich in JS, damit eine
 * abweichende NULL-Behandlung in HANA nicht doch Leerzeilen durchlässt.
 */
const POSITIONS_SQL = `SELECT "ContractPositionID", "ContractID", "Position",
  "Matchcode", "Description1", "Company", "ServiceNumber", "Indent", "ParentID"
FROM "MARIContractPositions"
WHERE "ServiceNumber" IS NOT NULL AND "ServiceNumber" <> ''`;

export type MariMasterSyncSummary = {
  attempted: boolean;
  reason?: string;
  contracts?: number;
  positions?: number;
  projectLists?: number;
  ms?: number;
};

function num(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function str(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

function toContractRow(raw: Record<string, unknown>): MariContractRow | null {
  const contractId = num(raw.ContractID);
  if (contractId <= 0) return null;
  return {
    contractId,
    contractNumber: str(raw.ContractNumber),
    projectNumber: str(raw.ProjectNumber),
    description: str(raw.Description),
    company: num(raw.Company) || null,
    inactive: mariFlagIsTrue(raw.Inactive),
  };
}

function toPositionRow(
  raw: Record<string, unknown>
): MariContractPositionRow | null {
  const positionId = num(raw.ContractPositionID);
  const contractId = num(raw.ContractID);
  if (positionId <= 0 || contractId <= 0) return null;
  if (!mariPositionIsBookable(raw.ServiceNumber)) return null;
  return {
    positionId,
    contractId,
    position: str(raw.Position),
    matchcode: str(raw.Matchcode),
    description: str(raw.Description1),
    company: num(raw.Company) || null,
    serviceNumber: str(raw.ServiceNumber),
    indent: num(raw.Indent),
    parentId: num(raw.ParentID) || null,
  };
}

/** Der erste aktive Maringo-Benutzer mit vollständiger Konfiguration. */
function pickSyncUserId(): number | null {
  for (const user of listActiveUsersWithModule("maringo")) {
    if (resolveMariConfigForUser(user.id)) return user.id;
  }
  return null;
}

async function refreshProjectLists(now: Date): Promise<number> {
  let refreshed = 0;
  for (const user of listActiveUsersWithModule("maringo")) {
    const cfg = resolveMariConfigForUser(user.id);
    if (!cfg) continue;
    if (!projectListNeedsRefresh(cfg.employeeNumber, now.getTime())) continue;
    try {
      const { listProjectsForTimeBooking } = await import(
        "@/lib/mari/timekeeping"
      );
      const projects = await runWithMariUser(user.id, () =>
        listProjectsForTimeBooking({
          employeeNumber: cfg.employeeNumber,
          skipCache: true,
        })
      );
      writeCachedProjectList(cfg.employeeNumber, projects, now.getTime());
      refreshed += 1;
    } catch (error) {
      console.warn(
        "[workbuddy] mari project list",
        cfg.employeeNumber,
        error instanceof Error ? error.message : error
      );
    }
  }
  return refreshed;
}

export async function syncMariMasterData(options?: {
  force?: boolean;
  now?: Date;
}): Promise<MariMasterSyncSummary> {
  const now = options?.now ?? new Date();
  const userId = pickSyncUserId();
  if (userId == null) return { attempted: false, reason: "not-configured" };

  if (!options?.force) {
    const lastRaw = getSetting(LAST_SYNC_KEY);
    if (lastRaw) {
      const last = new Date(lastRaw).getTime();
      if (
        Number.isFinite(last) &&
        now.getTime() - last < MARI_MASTER_SYNC_INTERVAL_MS
      ) {
        return { attempted: false, reason: "throttled" };
      }
    }
  }

  const started = Date.now();
  return runWithMariUser(userId, async () => {
    const contractRows = await mariSql<Record<string, unknown>>(CONTRACTS_SQL);
    const positionRows = await mariSql<Record<string, unknown>>(POSITIONS_SQL);

    const contracts = contractRows
      .map(toContractRow)
      .filter((c): c is MariContractRow => c != null);
    const positions = positionRows
      .map(toPositionRow)
      .filter((p): p is MariContractPositionRow => p != null);

    const written = replaceMariMasterData({
      contracts,
      positions,
      now: now.getTime(),
    });
    setSetting(LAST_SYNC_KEY, now.toISOString());

    const projectLists = await refreshProjectLists(now);
    return {
      attempted: true,
      contracts: written.contracts,
      positions: written.positions,
      projectLists,
      ms: Date.now() - started,
    };
  });
}

export function getMariMasterDataStatus() {
  return {
    ...getMariMasterDataState(),
    lastSyncAt: getSetting(LAST_SYNC_KEY),
    intervalMs: MARI_MASTER_SYNC_INTERVAL_MS,
  };
}
