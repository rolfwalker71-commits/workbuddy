import { getSetting, setSetting } from "@/lib/db/migrations";
import { resolveMariConfigForUser } from "@/lib/mari/settings";
import { listMyTickets, type MariTicketListItem } from "@/lib/mari/tickets";
import {
  ALL_STATUS_IDS,
  OPEN_WORK_STATUS_IDS,
  statusChipLabel,
} from "@/lib/mari/status";
import { ttvInboxDateWindow } from "@/lib/mari/ttv";
import { runWithMariUser } from "@/lib/mari/request-context";
import { getMariTicketFilterPrefs } from "@/lib/mari/ticket-filter-prefs";
import {
  diffTickets,
  filterChangesByScopes,
  formatTicketChangeDigest,
  groupChangesByReason,
  ticketToSnapshot,
  MARI_SNAPSHOT_VERSION,
  type MariTicketChangeEvent,
  type MariTicketScope,
  type MariTicketSnapshotRow,
} from "@/lib/mari/ticket-change-diff";
import {
  fetchLastCustomerLineAt,
  selectReplyProbeCandidates,
} from "@/lib/mari/ticket-customer-reply";
import { listWatchedTicketIds } from "@/lib/mari/ticket-watch-store";
import { notifyAppChange } from "@/lib/realtime/notify";
import {
  getNotificationPrefsForOwnerKey,
  isReasonEnabled,
} from "@/lib/realtime/prefs";
import { listActiveUsersWithModule } from "@/lib/users/queries";
import { parseOwnerKey } from "@/lib/auth/owner-key";

export {
  MARI_SNAPSHOT_VERSION,
  type MariTicketChangeEvent,
  type MariTicketScope,
  type MariTicketSnapshotRow,
} from "@/lib/mari/ticket-change-diff";

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
function snapshotVersionKey(userId: number) {
  return `mari_tickets_snapshot_version_u${userId}`;
}

const SYNC_STATUS_IDS = [...ALL_STATUS_IDS];

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
  /** Wie viele beobachtete Tickets zusätzlich geladen wurden. */
  watchedFetched?: number;
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

function persistHomeTicketSnapshot(
  userId: number,
  tickets: MariTicketListItem[],
  statusIds: number[]
): void {
  const fetched = new Set(statusIds.map((n) => Number(n)));
  const prev = readJsonSetting<MariTicketSnapshotRow[]>(snapshotKey(userId), []);
  const kept = prev.filter((row) => !fetched.has(Number(row.status)));
  const next = [...kept, ...tickets.map((t) => ticketToSnapshot(t))];
  const at = new Date().toISOString();
  setSetting(snapshotKey(userId), JSON.stringify(next));
  setSetting(
    countsKey(userId),
    JSON.stringify(buildCountsForStatuses(next, SYNC_STATUS_IDS))
  );
  setSetting(lastPollKey(userId), at);
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
  const prefs = ownerKey ? getMariTicketFilterPrefs(ownerKey) : null;
  const statusIds =
    prefs && prefs.statuses.length > 0
      ? prefs.statuses
      : [...OPEN_WORK_STATUS_IDS];
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

/**
 * Gleiche Ticket-Zahlen wie der Maringo-Bericht (gefilterte Status + Personalnummer).
 * Nicht der Hintergrund-Snapshot — der kann leer bleiben, wenn der Poll scheitert.
 */
export async function loadMariHomeTicketWatch(params: {
  userId: number;
  ownerKey: string;
}): Promise<MariTicketsWatchState> {
  const { userId, ownerKey } = params;
  const cfg = resolveMariConfigForUser(userId);
  const prefs = getMariTicketFilterPrefs(ownerKey);
  const statusIds =
    prefs.statuses.length > 0 ? prefs.statuses : [...OPEN_WORK_STATUS_IDS];

  if (!cfg) {
    return {
      configured: false,
      employeeNumber: null,
      lastPollAt: null,
      countsByStatus: buildCountsForStatuses([], statusIds),
      total: 0,
      recentChanges: [],
    };
  }

  try {
    const tickets = await runWithMariUser(userId, () =>
      listMyTickets({
        employeeNumber: cfg.employeeNumber,
        statuses: statusIds,
        overdueOnly: Boolean(prefs.overdueOnly),
        limit: 200,
      })
    );
    persistHomeTicketSnapshot(userId, tickets, statusIds);
    const recentChanges = readJsonSetting<MariTicketChangeEvent[]>(
      recentKey(userId),
      []
    );
    const allowed = new Set(statusIds.map((n) => Number(n)));
    const statusByIssue = new Map(tickets.map((t) => [t.issueId, t.status]));
    return {
      configured: true,
      employeeNumber: cfg.employeeNumber,
      lastPollAt: new Date().toISOString(),
      countsByStatus: buildCountsForStatuses(tickets, statusIds),
      total: tickets.length,
      recentChanges: recentChanges
        .filter((ch) => allowed.has(statusByIssue.get(Number(ch.issueId)) ?? -1))
        .slice(0, 12),
    };
  } catch (error) {
    console.warn("[workbuddy] home mari tickets", error);
    return getMariTicketsWatchState(ownerKey);
  }
}

const homeTicketRefresh = new Map<number, Promise<MariTicketsWatchState>>();

export async function getMariTicketsWatchStateLive(
  ownerKey?: string | null
): Promise<MariTicketsWatchState> {
  const userId = userIdFromOwnerKey(ownerKey);
  if (userId == null) return getMariTicketsWatchState(ownerKey);
  const key = userId;
  const existing = homeTicketRefresh.get(key);
  if (existing) return existing;
  const promise = loadMariHomeTicketWatch({
    userId,
    ownerKey: ownerKey || `user:${userId}`,
  }).finally(() => {
    if (homeTicketRefresh.get(key) === promise) homeTicketRefresh.delete(key);
  });
  homeTicketRefresh.set(key, promise);
  return promise;
}

/** Vom Handler unabhängig, deshalb einmal je Durchlauf für alle Benutzer. */
export type SharedNewTickets = MariTicketListItem[] | null;

export async function syncMariTicketsForUser(
  userId: number,
  options?: {
    force?: boolean;
    now?: Date;
    /** Ergebnis der geteilten "alle neuen Tickets"-Abfrage. */
    sharedNew?: SharedNewTickets;
  }
): Promise<MariTicketsSyncSummary> {
  const now = options?.now ?? new Date();
  const cfg = resolveMariConfigForUser(userId);
  if (!cfg) {
    return { attempted: false, reason: "not-configured", userId };
  }

  const ownerKey = `user:${userId}`;
  const prefs = getNotificationPrefsForOwnerKey(ownerKey);
  const scopes = prefs.mariTicketScopes;

  return runWithMariUser(userId, async () => {
    const employeeNumber = cfg.employeeNumber;
    const desiredStatuses = [...SYNC_STATUS_IDS].sort((a, b) => a - b).join(",");
    const statusSetChanged = getSetting(statusesKey(userId)) !== desiredStatuses;
    const versionChanged =
      getSetting(snapshotVersionKey(userId)) !== String(MARI_SNAPSHOT_VERSION);
    const force =
      Boolean(options?.force) || statusSetChanged || versionChanged;

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

    const lastPollAt = getSetting(lastPollKey(userId));
    const at = now.toISOString();
    const prevSnap = readJsonSetting<MariTicketSnapshotRow[]>(
      snapshotKey(userId),
      []
    );
    const prevById = new Map(prevSnap.map((row) => [row.issueId, row]));

    // MARI-Aufruf 1: unverändert die mir zugewiesenen Tickets.
    const assigned = await listMyTickets({
      employeeNumber,
      statuses: SYNC_STATUS_IDS,
      limit: 200,
    });

    // Der Empty-Result-Guard hängt weiterhin nur an dieser Abfrage: liefert
    // MARI hier nichts, obwohl vorher etwas da war, ist das ein Fehlschlag und
    // keine Änderung.
    if (assigned.length === 0 && prevSnap.length > 0) {
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

    const byId = new Map<
      number,
      { ticket: MariTicketListItem; scopes: MariTicketScope[] }
    >();
    for (const ticket of assigned) {
      byId.set(ticket.issueId, { ticket, scopes: ["assigned"] });
    }

    // Umfang (b): geteilte Abfrage, kein eigener MARI-Aufruf je Benutzer.
    if (scopes.allNew && options?.sharedNew) {
      for (const ticket of options.sharedNew) {
        const hit = byId.get(ticket.issueId);
        if (hit) {
          if (!hit.scopes.includes("allNew")) hit.scopes.push("allNew");
        } else {
          byId.set(ticket.issueId, { ticket, scopes: ["allNew"] });
        }
      }
    }

    // Umfang (c): nur die beobachteten IDs nachladen, die oben fehlen.
    let watchedFetched = 0;
    if (scopes.watched) {
      const missing = listWatchedTicketIds(userId).filter(
        (id) => !byId.has(id)
      );
      if (missing.length > 0) {
        // Ohne statuses, damit auch ein geschlossenes beobachtetes Ticket auflöst.
        const watched = await listMyTickets({ issueIds: missing }).catch(
          () => [] as MariTicketListItem[]
        );
        watchedFetched = watched.length;
        for (const ticket of watched) {
          const hit = byId.get(ticket.issueId);
          if (hit) {
            if (!hit.scopes.includes("watched")) hit.scopes.push("watched");
          } else {
            byId.set(ticket.issueId, { ticket, scopes: ["watched"] });
          }
        }
      } else {
        for (const id of listWatchedTicketIds(userId)) {
          const hit = byId.get(id);
          if (hit && !hit.scopes.includes("watched")) hit.scopes.push("watched");
        }
      }
    }

    const collected = [...byId.values()];
    const isBaseline = !lastPollAt || statusSetChanged || versionChanged;

    // Kundenantworten nur abfragen, wenn sie überhaupt gemeldet würden.
    let replyAt = new Map<number, string>();
    if (!isBaseline && isReasonEnabled(prefs, "mari_ticket_reply")) {
      const probeIds = selectReplyProbeCandidates(
        collected.map(({ ticket }) => {
          const prev = prevById.get(ticket.issueId);
          return {
            issueId: ticket.issueId,
            changeAtDate: ticket.changeAtDate || null,
            isNew: !prev,
            previousChangeAtDate: prev?.changeAtDate,
          };
        })
      );
      if (probeIds.length > 0) {
        replyAt = await fetchLastCustomerLineAt(probeIds).catch(
          () => new Map<number, string>()
        );
      }
    }

    const nextSnap = collected.map(({ ticket, scopes: ticketScopes }) =>
      ticketToSnapshot(
        ticket,
        ticketScopes,
        // Nicht abgefragt heisst "unverändert", nicht "keine Antwort".
        replyAt.get(ticket.issueId) ??
          prevById.get(ticket.issueId)?.lastCustomerAt ??
          null
      )
    );

    const allChanges = isBaseline
      ? []
      : diffTickets(prevSnap, nextSnap, at, { since: lastPollAt });
    const changes = filterChangesByScopes(allChanges, scopes);

    const prevRecent = readJsonSetting<MariTicketChangeEvent[]>(
      recentKey(userId),
      []
    );
    const recent = [...changes, ...prevRecent].slice(0, 12);
    const counts = buildCountsForStatuses(assigned, SYNC_STATUS_IDS);

    setSetting(snapshotKey(userId), JSON.stringify(nextSnap));
    setSetting(countsKey(userId), JSON.stringify(counts));
    setSetting(recentKey(userId), JSON.stringify(recent));
    setSetting(lastPollKey(userId), at);
    setSetting(statusesKey(userId), desiredStatuses);
    setSetting(snapshotVersionKey(userId), String(MARI_SNAPSHOT_VERSION));

    // Eine gebündelte Meldung je Art statt einer je Ticket.
    let notified = false;
    for (const [reason, group] of groupChangesByReason(changes)) {
      const { headline, detail } = formatTicketChangeDigest(reason, group);
      notifyAppChange({
        domain: "maringo",
        reason,
        headline,
        detail,
        title: group[0]?.title ?? null,
        href:
          group.length === 1
            ? `/maringo?issueId=${group[0]!.issueId}`
            : "/maringo",
        aiIconUrl: null,
        category: "Maringo",
        meta: employeeNumber,
        source: "maringo",
        ownerUserId: userId,
        ownerKey,
        skipWebPush: false,
      });
      notified = true;
    }

    return {
      attempted: true,
      employeeNumber,
      ticketCount: assigned.length,
      changeCount: changes.length,
      notified,
      userId,
      watchedFetched,
    };
  });
}

export async function syncMariTicketsIfDue(options?: {
  force?: boolean;
  now?: Date;
}): Promise<MariTicketsSyncSummary> {
  const users = listActiveUsersWithModule("maringo");

  // "Alle neuen Tickets" ist handlerunabhängig: einmal holen und an alle
  // Benutzer weiterreichen, statt die Abfrage je Benutzer zu wiederholen.
  let sharedNew: SharedNewTickets = null;
  const wantsAllNew = users.some(
    (user) =>
      getNotificationPrefsForOwnerKey(`user:${user.id}`).mariTicketScopes.allNew
  );
  if (wantsAllNew) {
    const firstConfigured = users.find((user) =>
      resolveMariConfigForUser(user.id)
    );
    if (firstConfigured) {
      sharedNew = await runWithMariUser(firstConfigured.id, () =>
        listMyTickets({
          ttvInbox: true,
          requestDateFrom: ttvInboxDateWindow(options?.now ?? new Date()).fromYmd,
          limit: 200,
        })
      ).catch((error) => {
        console.warn("[workbuddy] mari shared new tickets", error);
        return null;
      });
    }
  }

  let attempted = false;
  let ticketCount = 0;
  let changeCount = 0;
  let notified = false;
  for (const user of users) {
    const result = await syncMariTicketsForUser(user.id, {
      ...options,
      sharedNew,
    }).catch(
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
