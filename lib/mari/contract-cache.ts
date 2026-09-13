/**
 * Verträge und Vertragspositionen lokal, als Vollabzug.
 *
 * Warum überhaupt: `/api/ProjectListContracts/{pn}/{flag}` und
 * `/api/ContractListPositionsForTimeKeeping/{id}` laufen beide über die
 * REST-Lane mit Concurrency 1 (siehe `client.ts`). Gemessen 72 ms pro Call —
 * hochgerechnet auf 1764 Verträge sind das ~127 s seriell. Dieselben Daten über
 * die SQL-Lane kosten 0,3 s (Verträge) und 0,8 s (Positionen), weil MARI dort
 * ganze Tabellen am Stück herausgibt und kein Zeilenlimit setzt.
 *
 * Darum kein inkrementeller Abgleich: bei ~1800 + ~2500 Zeilen ist ein
 * vollständiger Austausch in einer Transaktion einfacher und schneller als jede
 * Diff-Logik, und der Cache kann nie teilweise veraltet sein.
 */

import { getDb } from "@/lib/db/client";
import {
  compareMariPositionNumbers,
  type MariContractRow,
  type MariContractPositionRow,
} from "@/lib/mari/contract-cache-shared";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";

export type MariMasterDataState = {
  syncedAt: string | null;
  contracts: number;
  positions: number;
};

type ContractDbRow = {
  contract_id: number;
  contract_number: string | null;
  project_number: string | null;
  description: string | null;
  company: number | null;
  inactive: number;
};

type PositionDbRow = {
  position_id: number;
  contract_id: number;
  position: string | null;
  matchcode: string | null;
  description: string | null;
  company: number | null;
  service_number: string | null;
  indent: number;
  parent_id: number | null;
};

/**
 * Vollständiger Austausch. Leere Eingaben werden abgelehnt statt geschrieben —
 * ein fehlgeschlagener Sync darf den Cache nicht leeren und damit jede
 * Buchungsmaske auf REST zurückwerfen.
 */
export function replaceMariMasterData(input: {
  contracts: readonly MariContractRow[];
  positions: readonly MariContractPositionRow[];
  now?: number;
}): { contracts: number; positions: number } {
  const contracts = input.contracts.filter(
    (c) => Number.isInteger(c.contractId) && c.contractId > 0
  );
  const positions = input.positions.filter(
    (p) =>
      Number.isInteger(p.positionId) &&
      p.positionId > 0 &&
      Number.isInteger(p.contractId) &&
      p.contractId > 0
  );
  if (contracts.length === 0) {
    throw new Error("Vertrags-Sync ohne Zeilen — Cache bleibt unverändert.");
  }

  const db = getDb();
  const at = new Date(input.now ?? Date.now()).toISOString();
  const insertContract = db.prepare(
    `INSERT INTO mari_contracts (
       contract_id, contract_number, project_number, description,
       company, inactive, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertPosition = db.prepare(
    `INSERT INTO mari_contract_positions (
       position_id, contract_id, position, matchcode, description,
       company, service_number, indent, parent_id, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM mari_contracts`).run();
    db.prepare(`DELETE FROM mari_contract_positions`).run();
    for (const c of contracts) {
      insertContract.run(
        c.contractId,
        c.contractNumber?.trim() || null,
        c.projectNumber?.trim() || null,
        c.description?.trim() || null,
        c.company && c.company > 0 ? c.company : null,
        c.inactive ? 1 : 0,
        at
      );
    }
    for (const p of positions) {
      insertPosition.run(
        p.positionId,
        p.contractId,
        p.position?.trim() || null,
        p.matchcode?.trim() || null,
        p.description?.trim() || null,
        p.company && p.company > 0 ? p.company : null,
        p.serviceNumber?.trim() || null,
        Number.isFinite(p.indent) ? Math.trunc(p.indent) : 0,
        p.parentId && p.parentId > 0 ? p.parentId : null,
        at
      );
    }
  });
  run();
  return { contracts: contracts.length, positions: positions.length };
}

export function getMariMasterDataState(): MariMasterDataState {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(synced_at) AS at FROM mari_contracts`
    )
    .get() as { n: number; at: string | null };
  const pos = db
    .prepare(`SELECT COUNT(*) AS n FROM mari_contract_positions`)
    .get() as { n: number };
  return {
    syncedAt: row?.at ?? null,
    contracts: row?.n ?? 0,
    positions: pos?.n ?? 0,
  };
}

/** Kalt heisst: noch nie synchronisiert. Aufrufer fallen dann auf REST zurück. */
export function mariMasterDataIsWarm(): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT 1 AS hit FROM mari_contracts LIMIT 1`)
    .get() as { hit: number } | undefined;
  return Boolean(row);
}

function contractToKeyPair(row: ContractDbRow): MariKeyPair {
  const matchcode = (row.description || "").trim();
  const visible = (row.contract_number || "").trim();
  return {
    matchcode: matchcode || visible || String(row.contract_id),
    keyVisible: visible,
    keyInternal: String(row.contract_id),
    indent: 0,
    indentParent: false,
    company: row.company && row.company > 0 ? row.company : null,
  };
}

/**
 * Verträge eines Projekts.
 *
 * `company` wird bewusst ignoriert: über REST diente der Parameter nur dazu, die
 * Abfrage pro Mandant zu wiederholen, wenn die einfache Variante leer blieb. Der
 * Vollabzug enthält alle Mandanten bereits, der Fan-out entfällt.
 *
 * Gibt `null` zurück, solange nie synchronisiert wurde.
 */
export function readContractsForProject(
  projectNumber: string,
  activeOnly: boolean
): MariKeyPair[] | null {
  const pn = projectNumber.trim();
  if (!pn) return [];
  if (!mariMasterDataIsWarm()) return null;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT contract_id, contract_number, project_number, description,
              company, inactive
       FROM mari_contracts
       WHERE project_number = ?${activeOnly ? " AND inactive = 0" : ""}
       ORDER BY contract_number, contract_id`
    )
    .all(pn) as ContractDbRow[];
  return rows.map(contractToKeyPair);
}

function positionToKeyPair(
  row: PositionDbRow,
  parentIds: Set<number>
): MariKeyPair {
  const matchcode = (row.matchcode || row.description || "").trim();
  const visible = (row.position || "").trim();
  return {
    matchcode: matchcode || visible || String(row.position_id),
    keyVisible: visible,
    keyInternal: String(row.position_id),
    indent: row.indent,
    indentParent: parentIds.has(row.position_id),
    company: row.company && row.company > 0 ? row.company : null,
  };
}

/** Bebuchbare Positionen eines Vertrags, in Gliederungsreihenfolge. */
export function readPositionsForContract(
  contractId: number
): MariKeyPair[] | null {
  if (!Number.isInteger(contractId) || contractId <= 0) return [];
  if (!mariMasterDataIsWarm()) return null;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT position_id, contract_id, position, matchcode, description,
              company, service_number, indent, parent_id
       FROM mari_contract_positions
       WHERE contract_id = ?`
    )
    .all(contractId) as PositionDbRow[];
  const parentIds = new Set(
    rows.map((r) => r.parent_id).filter((id): id is number => Boolean(id))
  );
  return rows
    .slice()
    .sort(
      (a, b) =>
        compareMariPositionNumbers(a.position, b.position) ||
        a.position_id - b.position_id
    )
    .map((row) => positionToKeyPair(row, parentIds));
}

/** Nach einer Änderung in MARI, damit der nächste Lesezugriff wieder REST fragt. */
export function clearMariMasterData(): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`DELETE FROM mari_contracts`).run();
    db.prepare(`DELETE FROM mari_contract_positions`).run();
  })();
}
