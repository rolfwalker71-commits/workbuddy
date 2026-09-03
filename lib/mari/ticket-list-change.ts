export type MariTicketListChangeKind = "status" | "due" | "update";

export type MariTicketSeenSnapshot = {
  issueId: number;
  status: number;
  dueDate: string | null;
  changeAtDate: string | null;
};

export type MariTicketListChange = {
  kinds: MariTicketListChangeKind[];
  fromStatus?: number;
  toStatus?: number;
  fromDue?: string | null;
  toDue?: string | null;
};

export type MariTicketChangeSource = {
  issueId: number;
  status: number;
  dueDate?: string | null;
  changeAtDate?: string | null;
};

function sameDue(a: string | null, b: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

export function ticketSeenSnapshot(
  ticket: MariTicketChangeSource
): MariTicketSeenSnapshot {
  return {
    issueId: ticket.issueId,
    status: Number(ticket.status) || 0,
    dueDate: ticket.dueDate ? ticket.dueDate.slice(0, 10) : null,
    changeAtDate: ticket.changeAtDate || null,
  };
}

/**
 * Changelog since the last opened (or first-seen) snapshot.
 * Status and due are always reported when they differ.
 * A generic update is only added when changeAtDate moved without status/due change
 * (MARI bumps changeAtDate for comments and many header saves).
 */
export function diffTicketSinceSeen(
  ticket: MariTicketChangeSource,
  seen: MariTicketSeenSnapshot | null | undefined
): MariTicketListChange | null {
  if (!seen || seen.issueId !== ticket.issueId) return null;

  const next = ticketSeenSnapshot(ticket);
  const kinds: MariTicketListChangeKind[] = [];
  const change: MariTicketListChange = { kinds };

  if (seen.status !== next.status) {
    kinds.push("status");
    change.fromStatus = seen.status;
    change.toStatus = next.status;
  }
  if (!sameDue(seen.dueDate, next.dueDate)) {
    kinds.push("due");
    change.fromDue = seen.dueDate;
    change.toDue = next.dueDate;
  }
  if (
    seen.changeAtDate !== next.changeAtDate &&
    next.changeAtDate &&
    !kinds.includes("status") &&
    !kinds.includes("due")
  ) {
    kinds.push("update");
  }

  return kinds.length > 0 ? change : null;
}

export function parseTicketSeenMap(raw: unknown): Record<string, MariTicketSeenSnapshot> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, MariTicketSeenSnapshot> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const issueId = Number(row.issueId ?? key);
    if (!Number.isInteger(issueId) || issueId <= 0) continue;
    out[String(issueId)] = {
      issueId,
      status: Number(row.status) || 0,
      dueDate:
        typeof row.dueDate === "string" && row.dueDate.trim()
          ? row.dueDate.slice(0, 10)
          : null,
      changeAtDate:
        typeof row.changeAtDate === "string" && row.changeAtDate.trim()
          ? row.changeAtDate
          : null,
    };
  }
  return out;
}
