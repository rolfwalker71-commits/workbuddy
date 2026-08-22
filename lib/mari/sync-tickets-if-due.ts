import { getSetting, setSetting } from "@/lib/db/migrations";
import { resolveMariConfigForUser } from "@/lib/mari/settings";
import { listMyTickets, type MariTicketListItem } from "@/lib/mari/tickets";
import {
  ALL_STATUS_IDS,
  OPEN_WORK_STATUS_IDS,
  statusChipLabel,
} from "@/lib/mari/status";
import { runWithMariUser } from "@/lib/mari/request-context";
import { notifyAppChange } from "@/lib/realtime/notify";
import { toSwissDate } from "@/lib/utils/dates";
import { listActiveUsersWithModule } from "@/lib/users/queries";
import { parseOwnerKey } from "@/lib/auth/owner-key";

export const MARI_TICKETS_SYNC_INTERVAL_MS = 10 * 60 * 1000;

function lastPollKey(userId: number) {
  return `mari_tickets_last_poll_at_u${userId}`;
}
function snapshotKey(userId: number) {
  return `mari_tickets_snapshot_json_u${userId}`;
}
function recentKey(userId: number) {
  return `mari_tickets_recent_changes_json_u${userId}`;
}
function countsKey(userId: number) {
  return `mari_tickets_counts_json_u${userId}`;
}
function statusesKey(userId: number) {
  return `mari_tickets_sync_status_ids_u${userId}`;
}

const SYNC_STATUS_IDS = [...ALL_STATUS_IDS];

export type MariTicketSnapshotRow = {
  issueId: number;
  status: number;
  dueDate: string | null;
  changeAtDate: string | null;
  briefDescription: string;
};

export type MariTicketChangeEvent = {
  at: string;
  issueId: number;
  title: string;
  kind: "new" | "status" | "due" | "update";
  detail: string;
};

export type MariTicketCountsByStatus = {
  statusId: number;
  label: string;
  count: number;
};

export type MariTicketsWatchState = {
  configured: boolean;
  employeeNumber: string | null;
  lastPollAt: string | null;
  countsByStatus: MariTicketCountsByStatus[];
  total: number;
  recentChanges: MariTicketChangeEvent[];
};

export type MariTicketsSyncSummary = {
  attempted: boolean;
  reason?: string;
  employeeNumber?: string;
  ticketCount?: number;
  changeCount?: number;
  notified?: boolean;
  userId?: number;
};

function readJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function ticketToSnapshot(t: MariTicketListItem): MariTicketSnapshotRow {
  return {
    issueId: t.issueId,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.slice(0, 10) : null,
    changeAtDate: t.changeAtDate || null,
    briefDescription: (t.briefDescription || "").slice(0, 200),
  };
}

function buildCountsForStatuses(
  tickets: Array<{ status: number }>,
  statusIds: number[]
): MariTicketCountsByStatus[] {
  const map = new Map<number, number>();
  for (const id of statusIds) map.set(id, 0);
  for (const t of tickets) {
    const status = Number(t.status);
    if (!map.has(status)) continue;
    map.set(status, (map.get(status) || 0) + 1);
  }
  return statusIds.map((statusId) => ({
    statusId,
    label: statusChipLabel(statusId),
    count: map.get(statusId) || 0,
  }));
}

function sameDay(a: string | null, b: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function diffTickets(
  prev: MariTicketSnapshotRow[],
  next: MariTicketSnapshotRow[],
  at: string
): MariTicketChangeEvent[] {
  const prevMap = new Map(prev.map((p) => [p.issueId, p]));
  const changes: MariTicketChangeEvent[] = [];
  for (const n of next) {
    const p = prevMap.get(n.issueId);
    if (!p) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "new",
        detail: `Neu in der Liste · ${statusChipLabel(n.status)}`,
      });
      continue;
    }
    if (p.status !== n.status) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "status",
        detail: `Status: ${statusChipLabel(p.status)} → ${statusChipLabel(n.status)}`,
      });
    }
    if (!sameDay(p.dueDate, n.dueDate)) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "due",
        detail: `Stichtag: ${toSwissDate(p.dueDate)} → ${toSwissDate(n.dueDate)}`,
      });
    } else if (
      p.changeAtDate !== n.changeAtDate &&
      n.changeAtDate &&
      p.status === n.status
    ) {
      changes.push({
        at,
        issueId: n.issueId,
        title: n.briefDescription,
        kind: "update",
        detail: "Aktualisierung / Kommentar",
      });
    }
  }
  return changes;
}

function userIdFromOwnerKey(ownerKey?: string | null): number | null {
  if (!ownerKey) return null;
  const parsed = parseOwnerKey(ownerKey);
  return parsed?.kind === "user" ? parsed.userId : null;
}

export function getMariTicketsWatchState(
  ownerKey?: string | null
): MariTicketsWatchState {
  const userId = userIdFromOwnerKey(ownerKey);
  const statusIds = [...OPEN_WORK_STATUS_IDS];
  if (userId == null) {
    return {
      configured: false,
      employeeNumber: null,
      lastPollAt: null,
      countsByStatus: buildCountsForStatuses([], statusIds),
      total: 0,
      recentChanges: [],
    };
  }
  const cfg = resolveMariConfigForUser(userId);
  const snapshot = readJsonSetting<MariTicketSnapshotRow[]>(
    snapshotKey(userId),
    []
  );
  const allowed = new Set(statusIds.map((n) => Number(n)));
  const filtered = snapshot.filter((row) => allowed.has(Number(row.status)));
  const recentChanges = readJsonSetting<MariTicketChangeEvent[]>(
    recentKey(userId),
    []
  );
  const statusByIssue = new Map(snapshot.map((r) => [r.issueId, r.status]));
  return {
    configured: Boolean(cfg),
    employeeNumber: cfg?.employeeNumber ?? null,
    lastPollAt: getSetting(lastPollKey(userId)),
    countsByStatus: buildCountsForStatuses(filtered, statusIds),
    total: filtered.length,
    recentChanges: recentChanges
      .filter((ch) => allowed.has(statusByIssue.get(Number(ch.issueId)) ?? -1))
      .slice(0, 12),
  };
}

export async function getMariTicketsWatchStateLive(
  ownerKey?: string | null
): Promise<MariTicketsWatchState> {
  const userId = userIdFromOwnerKey(ownerKey);
  if (userId == null) return getMariTicketsWatchState(ownerKey);
  const snapshot = readJsonSetting<MariTicketSnapshotRow[]>(
    snapshotKey(userId),
    []
  );
  const lastRaw = getSetting(lastPollKey(userId));
  const last = lastRaw ? Date.parse(lastRaw) : NaN;
  const fresh =
    snapshot.length > 0 &&
    Number.isFinite(last) &&
    Date.now() - last < MARI_TICKETS_SYNC_INTERVAL_MS;
  if (!fresh) {
    await syncMariTicketsForUser(userId, { force: true }).catch(() => null);
  }
  return getMariTicketsWatchState(ownerKey);
}

export async function syncMariTicketsForUser(
  userId: number,
  options?: { force?: boolean; now?: Date }
): Promise<MariTicketsSyncSummary> {
  const now = options?.now ?? new Date();
  const cfg = resolveMariConfigForUser(userId);
  if (!cfg) {
    return { attempted: false, reason: "not-configured", userId };
  }

  return runWithMariUser(userId, async () => {
    const employeeNumber = cfg.employeeNumber;
    const desiredStatuses = [...SYNC_STATUS_IDS].sort((a, b) => a - b).join(",");
    const statusSetChanged = getSetting(statusesKey(userId)) !== desiredStatuses;
    const force = Boolean(options?.force) || statusSetChanged;

    if (!force) {
      const lastRaw = getSetting(lastPollKey(userId));
      if (lastRaw) {
        const last = new Date(lastRaw).getTime();
        if (
          Number.isFinite(last) &&
          now.getTime() - last < MARI_TICKETS_SYNC_INTERVAL_MS
        ) {
          return { attempted: false, reason: "throttled", employeeNumber, userId };
        }
      }
    }

    const tickets = await listMyTickets({
      employeeNumber,
      statuses: SYNC_STATUS_IDS,
      limit: 200,
    });
    const nextSnap = tickets.map(ticketToSnapshot);
    const at = now.toISOString();
    const prevSnap = readJsonSetting<MariTicketSnapshotRow[]>(
      snapshotKey(userId),
      []
    );

    if (nextSnap.length === 0 && prevSnap.length > 0) {
      setSetting(lastPollKey(userId), at);
      if (statusSetChanged) setSetting(statusesKey(userId), desiredStatuses);
      return {
        attempted: true,
        employeeNumber,
        ticketCount: 0,
        changeCount: 0,
        notified: false,
        userId,
      };
    }

    const isBaseline = !getSetting(lastPollKey(userId)) || statusSetChanged;
    const changes = isBaseline ? [] : diffTickets(prevSnap, nextSnap, at);
    const prevRecent = readJsonSetting<MariTicketChangeEvent[]>(
      recentKey(userId),
      []
    );
    const recent = [...changes, ...prevRecent].slice(0, 12);
    const counts = buildCountsForStatuses(tickets, SYNC_STATUS_IDS);

    setSetting(snapshotKey(userId), JSON.stringify(nextSnap));
    setSetting(countsKey(userId), JSON.stringify(counts));
    setSetting(recentKey(userId), JSON.stringify(recent));
    setSetting(lastPollKey(userId), at);
    setSetting(statusesKey(userId), desiredStatuses);

    let notified = false;
    if (changes.length > 0) {
      const top = changes.slice(0, 3);
      const detailParts = top.map((c) => `#${c.issueId}: ${c.detail}`);
      if (changes.length > 3) {
        detailParts.push(`+${changes.length - 3} weitere`);
      }
      notifyAppChange({
        domain: "maringo",
        reason: "mari_ticket_changed",
        headline:
          changes.length === 1
            ? `Maringo #${changes[0]!.issueId} aktualisiert`
            : `Maringo: ${changes.length} Ticket-Updates`,
        detail: detailParts.join(" · "),
        title: top[0]?.title ?? null,
        href: "/maringo",
        aiIconUrl: null,
        category: "Maringo",
        meta: employeeNumber,
        source: "maringo",
        ownerUserId: userId,
        ownerKey: `user:${userId}`,
        skipWebPush: false,
      });
      notified = true;
    }

    return {
      attempted: true,
      employeeNumber,
      ticketCount: tickets.length,
      changeCount: changes.length,
      notified,
      userId,
    };
  });
}

/** Scheduler entry: poll every Maringo user with own credentials. */
export async function syncMariTicketsIfDue(options?: {
  force?: boolean;
  now?: Date;
}): Promise<MariTicketsSyncSummary> {
  const users = listActiveUsersWithModule("maringo");
  let attempted = false;
  let ticketCount = 0;
  let changeCount = 0;
  let notified = false;
  for (const user of users) {
    const result = await syncMariTicketsForUser(user.id, options).catch(
      (error) => {
        console.warn("[workbuddy] mari poll user", user.id, error);
        return {
          attempted: false,
          reason: "error",
          userId: user.id,
        } satisfies MariTicketsSyncSummary;
      }
    );
    if (result.attempted) {
      attempted = true;
      ticketCount += result.ticketCount ?? 0;
      changeCount += result.changeCount ?? 0;
      if (result.notified) notified = true;
    }
  }
  if (!attempted) {
    return { attempted: false, reason: "no-users" };
  }
  return { attempted: true, ticketCount, changeCount, notified };
}
