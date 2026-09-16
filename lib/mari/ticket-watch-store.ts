/**
 * Von Hand beobachtete Tickets, je Benutzer.
 *
 * Ablage im generischen `settings`-KV wie `ticket-seen-store.ts` und
 * `ticket-filter-prefs.ts` — kein Schemawechsel nötig, und die einzige Abfrage,
 * die je gebraucht wird, ist „was beobachtet Benutzer X".
 */
import { getSetting, setSetting } from "@/lib/db/migrations";

/**
 * Harte Grenze, keine Vorliebe: `buildTicketWhereClauses` schneidet `issueIds`
 * in `lib/mari/tickets.ts` auf 40 ab. Mehr Sterne wären stumm wirkungslos.
 */
export const MARI_TICKET_WATCH_MAX = 40;

export type MariTicketWatchEntry = {
  issueId: number;
  at: string;
  title: string;
};

function watchKey(userId: number): string {
  return `mari_ticket_watch_json_u${userId}`;
}

type StoredEntry = { at?: unknown; title?: unknown };

function readWatchMap(userId: number): Map<number, MariTicketWatchEntry> {
  const out = new Map<number, MariTicketWatchEntry>();
  if (!Number.isInteger(userId) || userId <= 0) return out;
  const raw = getSetting(watchKey(userId));
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, StoredEntry>;
    if (!parsed || typeof parsed !== "object") return out;
    for (const [key, value] of Object.entries(parsed)) {
      const issueId = Number(key);
      if (!Number.isInteger(issueId) || issueId <= 0) continue;
      out.set(issueId, {
        issueId,
        at: typeof value?.at === "string" ? value.at : "",
        title: typeof value?.title === "string" ? value.title : "",
      });
    }
  } catch {
    /* kaputter Eintrag zählt als leere Liste */
  }
  return out;
}

function writeWatchMap(
  userId: number,
  map: Map<number, MariTicketWatchEntry>
): void {
  const obj: Record<string, { at: string; title: string }> = {};
  for (const [issueId, entry] of map) {
    obj[String(issueId)] = { at: entry.at, title: entry.title };
  }
  setSetting(watchKey(userId), JSON.stringify(obj));
}

export function listWatchedTickets(userId: number): MariTicketWatchEntry[] {
  return [...readWatchMap(userId).values()].sort((a, b) =>
    b.at.localeCompare(a.at)
  );
}

export function listWatchedTicketIds(userId: number): number[] {
  return [...readWatchMap(userId).keys()];
}

export function isTicketWatched(userId: number, issueId: number): boolean {
  return readWatchMap(userId).has(issueId);
}

export type SetWatchedResult = {
  watched: boolean;
  count: number;
  /** true, wenn das Limit den Wunsch verhindert hat. */
  limitHit: boolean;
};

export function setTicketWatched(
  userId: number,
  issueId: number,
  watched: boolean,
  title?: string | null
): SetWatchedResult {
  const map = readWatchMap(userId);
  if (!Number.isInteger(issueId) || issueId <= 0) {
    return { watched: false, count: map.size, limitHit: false };
  }

  if (!watched) {
    map.delete(issueId);
    writeWatchMap(userId, map);
    return { watched: false, count: map.size, limitHit: false };
  }

  if (!map.has(issueId) && map.size >= MARI_TICKET_WATCH_MAX) {
    // Lieber ehrlich ablehnen als einen Stern setzen, der nie etwas meldet.
    return { watched: false, count: map.size, limitHit: true };
  }

  map.set(issueId, {
    issueId,
    at: map.get(issueId)?.at || new Date().toISOString(),
    title: (title || map.get(issueId)?.title || "").slice(0, 200),
  });
  writeWatchMap(userId, map);
  return { watched: true, count: map.size, limitHit: false };
}

/** Markiert in einer Ticketliste, welche Einträge beobachtet werden. */
export function attachMariTicketWatchFlags<T extends { issueId: number }>(
  userId: number | null,
  tickets: T[]
): Array<T & { watched: boolean }> {
  const map = userId != null ? readWatchMap(userId) : new Map();
  return tickets.map((ticket) => ({
    ...ticket,
    watched: map.has(ticket.issueId),
  }));
}
