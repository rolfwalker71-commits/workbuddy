/** Client-sichere Kunden-Chip-Typen & Labels (kein Node/SQLite). */

export type MariEmailPartnerSuggestion = {
  cardCode: string;
  name: string;
  contactName: string | null;
  source: "ocrd" | "ocpr" | "issue" | "title";
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
  /** Outlook-Teilnehmer, der diesen Treffer ausgelöst hat. */
  matchedEmail?: string | null;
  /** Kurz warum der Chip da ist (Betreff-Token oder Teilnehmer-Mail). */
  reason?: string | null;
};

export const ATTENDEE_CONTACT_REASON = "Ansprechpartner im Termin";

export function partnerSuggestionChipLabel(
  s: Pick<
    MariEmailPartnerSuggestion,
    "name" | "cardCode" | "projectNumber" | "contactName" | "matchedEmail"
  >
): string {
  if (s.projectNumber) return `${s.name} · ${s.projectNumber}`;
  if (s.contactName && s.matchedEmail) {
    return `${s.contactName} · ${s.matchedEmail}`;
  }
  if (s.matchedEmail) return `${s.name} · ${s.matchedEmail}`;
  return `${s.name} · ${s.cardCode}`;
}

export function partnerSuggestionChipReason(
  s: Pick<MariEmailPartnerSuggestion, "reason" | "matchedEmail" | "source">
): string | null {
  if (s.reason) return s.reason;
  if (
    s.matchedEmail ||
    s.source === "ocrd" ||
    s.source === "ocpr" ||
    s.source === "issue"
  ) {
    return ATTENDEE_CONTACT_REASON;
  }
  if (s.source === "title") return "Aus dem Betreff";
  return null;
}
