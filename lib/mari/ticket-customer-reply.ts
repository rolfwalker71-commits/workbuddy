/**
 * Wann hat der Kunde zuletzt geschrieben?
 *
 * Bewusst NICHT über `getTicketDetail` — das wären mehrere SQL-Abfragen je
 * Ticket. MARI serialisiert alle Anfragen über eine Lane mit 20s-Deckel, also
 * genau ein Aggregat für alle geänderten Tickets eines Durchlaufs.
 */
import { mariSql } from "@/lib/mari/client";

/**
 * Verlaufstypen der Kundenseite. Deckungsgleich mit `resolveTimelineSide`
 * (`lib/mari/timeline-side.ts`), damit Meldung und Verlaufsansicht dasselbe
 * als "vom Kunden" verstehen.
 */
export const CUSTOMER_LINE_POS_TYPES = [3, 8] as const;

/** Passt zur harten Grenze von `issueIds` in `buildTicketWhereClauses`. */
export const CUSTOMER_REPLY_PROBE_MAX = 40;

type Row = { IssueID?: number; LastAt?: string | null };

/**
 * Liefert je Ticket den neuesten kundenseitigen Eintrag.
 * Scheitert weich: eine leere Map bedeutet "unbekannt", nie "keine Antwort" —
 * sonst würde ein SQL-Problem falsche Meldungen erzeugen.
 */
export async function fetchLastCustomerLineAt(
  issueIds: readonly number[]
): Promise<Map<number, string>> {
  const ids = [
    ...new Set(
      issueIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
    ),
  ].slice(0, CUSTOMER_REPLY_PROBE_MAX);
  const out = new Map<number, string>();
  if (ids.length === 0) return out;

  const posTypes = CUSTOMER_LINE_POS_TYPES.join(", ");
  const rows = await mariSql<Row>(
    `SELECT "IssueID", MAX("CreateDate") AS "LastAt"
FROM "MARISupportIssueLine"
WHERE "IssueID" IN (${ids.join(", ")})
  AND "RequestPosType" IN (${posTypes})
GROUP BY "IssueID"`
  );

  for (const row of rows) {
    const issueId = Number(row.IssueID);
    const at = typeof row.LastAt === "string" ? row.LastAt.trim() : "";
    if (Number.isInteger(issueId) && issueId > 0 && at) {
      out.set(issueId, at);
    }
  }
  return out;
}

export type ReplyProbeCandidate = {
  issueId: number;
  changeAtDate: string | null;
  /** true, wenn das Ticket in diesem Durchlauf erstmals auftaucht. */
  isNew: boolean;
  /** changeAtDate aus der vorherigen Momentaufnahme. */
  previousChangeAtDate: string | null | undefined;
};

/**
 * Welche Tickets lohnen die Abfrage? Nur die, bei denen sich überhaupt etwas
 * bewegt hat — neue brauchen keinen Vergleichswert. Der Überhang behält seinen
 * alten Marker und bleibt im nächsten Durchlauf Kandidat, es geht also nichts
 * verloren.
 */
export function selectReplyProbeCandidates(
  candidates: readonly ReplyProbeCandidate[],
  max: number = CUSTOMER_REPLY_PROBE_MAX
): number[] {
  return candidates
    .filter((c) => !c.isNew)
    .filter((c) => c.changeAtDate && c.changeAtDate !== c.previousChangeAtDate)
    .sort((a, b) => (b.changeAtDate || "").localeCompare(a.changeAtDate || ""))
    .slice(0, Math.max(0, max))
    .map((c) => c.issueId);
}
