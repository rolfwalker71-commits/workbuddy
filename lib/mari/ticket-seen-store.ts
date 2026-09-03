import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  diffTicketSinceSeen,
  parseTicketSeenMap,
  ticketSeenSnapshot,
  type MariTicketListChange,
  type MariTicketSeenSnapshot,
} from "@/lib/mari/ticket-list-change";

function seenKey(userId: number) {
  return `mari_tickets_seen_json_u${userId}`;
}

function readSeenMap(userId: number): Record<string, MariTicketSeenSnapshot> {
  const raw = getSetting(seenKey(userId));
  if (!raw) return {};
  try {
    return parseTicketSeenMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeSeenMap(
  userId: number,
  map: Record<string, MariTicketSeenSnapshot>
): void {
  setSetting(seenKey(userId), JSON.stringify(map));
}

export function markMariTicketSeen(
  userId: number,
  ticket: {
    issueId: number;
    status: number;
    dueDate?: string | null;
    changeAtDate?: string | null;
  }
): void {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(ticket.issueId) || ticket.issueId <= 0) return;
  const map = readSeenMap(userId);
  map[String(ticket.issueId)] = ticketSeenSnapshot(ticket);
  writeSeenMap(userId, map);
}

/**
 * Compare list tickets to the last opened snapshot.
 * Tickets never stored before get a silent baseline (no changelog flood).
 * Later diffs stay until the ticket is opened (`markMariTicketSeen`).
 */
export function attachMariTicketListChanges<
  T extends {
    issueId: number;
    status: number;
    dueDate?: string | null;
    changeAtDate?: string | null;
  },
>(
  userId: number,
  tickets: T[]
): Array<T & { listChange: MariTicketListChange | null }> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return tickets.map((t) => ({ ...t, listChange: null }));
  }
  const map = readSeenMap(userId);
  let dirty = false;
  const out = tickets.map((ticket) => {
    const key = String(ticket.issueId);
    const prev = map[key];
    if (!prev) {
      map[key] = ticketSeenSnapshot(ticket);
      dirty = true;
      return { ...ticket, listChange: null };
    }
    return { ...ticket, listChange: diffTicketSinceSeen(ticket, prev) };
  });
  if (dirty) writeSeenMap(userId, map);
  return out;
}
