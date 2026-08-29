/** Client-safe ticket list search helpers (no Node/SQLite/MARI). */

export const MARI_ISSUE_IDS_MAX = 40;

/** Digits only, optional leading `#` — e.g. `144078` or `#144078`. */
export function parseTicketNumberQuery(
  raw: string | null | undefined
): number | null {
  const q = (raw || "").trim();
  const m = /^#?(\d{1,10})$/.exec(q);
  if (!m) return null;
  const id = Number(m[1]);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/** Live lookup once the number is complete enough (avoids fetching on `1`, `14`). */
export function shouldLookupTicketNumber(
  raw: string | null | undefined
): boolean {
  const id = parseTicketNumberQuery(raw);
  return id != null && id >= 1000;
}

export function parseIssueIdsParam(
  raw: string | null | undefined
): number[] {
  if (!raw?.trim()) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const id = parseTicketNumberQuery(part);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MARI_ISSUE_IDS_MAX) break;
  }
  return ids;
}

export type MariTicketTextSearchFields = {
  issueId: number;
  briefDescription: string;
  addressMatchcode?: string | null;
  cardCode?: string | null;
  referenceText?: string | null;
  handledByName?: string | null;
};

export function ticketMatchesTextQuery(
  ticket: MariTicketTextSearchFields,
  query: string
): boolean {
  const q = query.replace(/^#/, "").trim().toLowerCase();
  if (!q) return true;
  if (String(ticket.issueId).includes(q)) return true;
  if (ticket.briefDescription.toLowerCase().includes(q)) return true;
  const fields = [
    ticket.addressMatchcode,
    ticket.cardCode,
    ticket.referenceText,
    ticket.handledByName,
  ];
  return fields.some((v) => (v || "").toLowerCase().includes(q));
}

export function filterTicketsByTextQuery<T extends MariTicketTextSearchFields>(
  tickets: T[],
  query: string
): T[] {
  const q = query.trim();
  if (!q) return tickets;
  return tickets.filter((t) => ticketMatchesTextQuery(t, q));
}
