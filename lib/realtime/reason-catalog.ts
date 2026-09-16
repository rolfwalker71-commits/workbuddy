/**
 * Reason-Katalog ohne DB-Abhängigkeit — die einzige Quelle für die Liste der
 * Benachrichtigungsarten.
 *
 * `lib/realtime/prefs.ts` importiert `lib/db/client` und ist damit server-only,
 * `prefs-client.ts` darf das nicht. Vorher hielt jede der beiden eine eigene
 * handgepflegte Kopie der Reason-Liste ("Keep in sync with …") — genau die
 * Sorte Duplikat, die beim Hinzufügen einer Reason still auseinanderläuft.
 * Beide importieren jetzt von hier.
 */
import type { NotifyReason } from "@/lib/realtime/hub";

export type NotifyReasonDomain = "maringo" | "microsoft" | "app";

export const ALL_NOTIFY_REASONS: NotifyReason[] = [
  "mari_ticket_changed",
  "mari_ticket_new",
  "mari_ticket_status",
  "mari_ticket_reply",
  "mari_ticket_field",
  "microsoft_mail_digest",
  "mail_calendar_patch",
  "microsoft_mail_day",
  "microsoft_teams_day",
  "evening_digest",
  "app_status",
];

/** Fallback-Beschriftungen; die UI übersetzt via `notifyReasonDisplayLabel`. */
export const NOTIFY_REASON_LABELS: Record<NotifyReason, string> = {
  mari_ticket_changed: "Maringo Ticket-Update",
  mari_ticket_new: "Neues Ticket",
  mari_ticket_status: "Ticket-Statuswechsel",
  mari_ticket_reply: "Neue Kundenantwort",
  mari_ticket_field: "Sonstige Ticket-Änderung",
  microsoft_mail_digest: "Neue Mails (gesammelt)",
  mail_calendar_patch: "Termin aus Mail aktualisiert",
  microsoft_mail_day: "Microsoft Tagesanalyse",
  microsoft_teams_day: "Teams-Tagesanalyse",
  evening_digest: "Tagesabschluss (Abend)",
  app_status: "App-Hinweis",
};

export const NOTIFY_REASON_DOMAIN: Record<NotifyReason, NotifyReasonDomain> = {
  mari_ticket_changed: "maringo",
  mari_ticket_new: "maringo",
  mari_ticket_status: "maringo",
  mari_ticket_reply: "maringo",
  mari_ticket_field: "maringo",
  microsoft_mail_digest: "microsoft",
  mail_calendar_patch: "microsoft",
  microsoft_mail_day: "microsoft",
  microsoft_teams_day: "microsoft",
  evening_digest: "app",
  app_status: "app",
};

/**
 * Ersetzte Arten: bleiben gültig (alte Historienzeilen und gespeicherte Prefs
 * tragen sie), verschwinden aber aus der Auswahl im Konto — ein Schalter, der
 * nichts mehr steuert, ist schlimmer als keiner.
 */
export const LEGACY_NOTIFY_REASONS: ReadonlySet<NotifyReason> = new Set([
  "mari_ticket_changed",
]);

/**
 * Arten, die ohne ausdrückliches Ja stumm bleiben.
 *
 * Sonst gilt „fehlender Schlüssel = an": bei jeder neuen Art wäre jeder
 * automatisch dabei. Für die lauteste Art (jede Feldänderung an jedem Ticket)
 * ist das die falsche Vorgabe.
 */
export const NOTIFY_REASON_DEFAULT_OFF: ReadonlySet<NotifyReason> = new Set([
  "mari_ticket_field",
]);

export function notifyReasonDefaultEnabled(reason: NotifyReason): boolean {
  return !NOTIFY_REASON_DEFAULT_OFF.has(reason);
}

/** Nachfolger der ersetzten Sammel-Reason. */
const SPLIT_TICKET_REASONS: NotifyReason[] = [
  "mari_ticket_new",
  "mari_ticket_status",
  "mari_ticket_reply",
  "mari_ticket_field",
];

/**
 * Wer den alten Sammel-Schalter bewusst ausgeschaltet hatte, soll durch die
 * Aufteilung in vier Arten nicht still wieder beschallt werden. Greift nur,
 * solange zu keiner der neuen Arten eine eigene Wahl vorliegt.
 */
export function applyLegacyTicketReasonIntent(
  events: Partial<Record<NotifyReason, boolean>>,
  stored: Partial<Record<NotifyReason, boolean>> | undefined
): Partial<Record<NotifyReason, boolean>> {
  if (!stored || stored.mari_ticket_changed !== false) return events;
  if (SPLIT_TICKET_REASONS.some((key) => stored[key] !== undefined)) {
    return events;
  }
  const out = { ...events };
  for (const key of SPLIT_TICKET_REASONS) out[key] = false;
  return out;
}

/**
 * Darf ein Benutzer mit diesen Modulen eine Meldung dieser Art überhaupt sehen?
 *
 * Das ist die Modul-Ebene, nicht die Besitz-Ebene: eine Meldung mit
 * `ownerUserId` gehört genau einem Benutzer und wird schon vorher aussortiert
 * (siehe `notificationVisibleTo` in `visibility.ts`).
 */
export function notifyReasonVisibleForModules(
  reason: NotifyReason,
  modules: readonly string[],
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  const domain = NOTIFY_REASON_DOMAIN[reason];
  if (domain === "app") {
    if (reason === "evening_digest") {
      return modules.includes("microsoft");
    }
    return true;
  }
  return modules.includes(domain);
}
