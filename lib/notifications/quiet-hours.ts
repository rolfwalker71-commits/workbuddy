/**
 * Ruhezeiten für Web Push.
 *
 * Bewusst nur der Push-Kanal: die Meldung wird trotzdem aufgezeichnet und
 * erscheint im Benachrichtigungscenter. Unterdrückt wird das Klingeln auf dem
 * Gerät, nicht die Information.
 *
 * Der reine Kern hat keine DB-Abhängigkeit; `isQuietNowForOwnerKey` unten ist
 * der dünne Wrapper, der Präsenz und Einstellungen nachschlägt.
 */
import type { NotifyReason } from "@/lib/realtime/hub";
import type { QuietHoursPrefs } from "@/lib/realtime/prefs";
import type { PresenceStatus } from "@/lib/presence/status";
import { isZurichWeekday } from "@/lib/dashboard/day-close-ritual";
import { hmToMinutes } from "@/lib/dashboard/day-close-prefs-parse";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";

/**
 * Arten, die Ruhezeiten ignorieren.
 *
 * Der Tagesabschluss feuert per Definition am Ende des Arbeitstags und bringt
 * bereits ein eigenes Zeitfenster plus Tages-Latch mit — ein zweites Gate
 * würde ein funktionierendes Feature still abschalten.
 */
export const QUIET_HOURS_EXEMPT_REASONS: ReadonlySet<NotifyReason> = new Set([
  "evening_digest",
  "app_status",
]);

/** Präsenzzustände, die den ganzen Tag stumm schalten. */
const AWAY_STATUSES: ReadonlySet<PresenceStatus> = new Set([
  "vacation",
  "sick",
  "absent",
]);

/** Liegt `nowMin` im Fenster? Fenster über Mitternacht werden unterstützt. */
export function isWithinQuietWindow(
  nowMin: number,
  startMin: number,
  endMin: number
): boolean {
  if (startMin === endMin) return true;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  // z.B. 22:00–06:00
  return nowMin >= startMin || nowMin < endMin;
}

export type QuietHoursInput = {
  reason: NotifyReason;
  /** "HH:MM" in Europe/Zurich */
  nowHm: string;
  /** "YYYY-MM-DD" in Europe/Zurich */
  ymd: string;
  window: QuietHoursPrefs;
  /** `null` = keine Präsenz hinterlegt → nicht als abwesend werten. */
  presenceStatus: PresenceStatus | null;
};

/** true = diese Push unterdrücken. */
export function quietHoursSuppresses(input: QuietHoursInput): boolean {
  if (QUIET_HOURS_EXEMPT_REASONS.has(input.reason)) return false;
  if (!input.window.enabled) return false;

  if (input.presenceStatus && AWAY_STATUSES.has(input.presenceStatus)) {
    return true;
  }
  if (input.window.weekdaysOnly && !isZurichWeekday(input.ymd)) return true;

  const now = hmToMinutes(input.nowHm);
  const start = hmToMinutes(input.window.startHm);
  const end = hmToMinutes(input.window.endHm);
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end)) {
    // Kaputte Zeitangabe darf nicht dazu führen, dass alles stumm bleibt.
    return false;
  }
  return !isWithinQuietWindow(now, start, end);
}

/**
 * Nachschlag-Variante für den Push-Versand. `presenceLookup` wird von aussen
 * gereicht, damit der Aufrufer die Abfrage über alle Subscriptions eines
 * Versands memoisieren kann (sonst eine Query je Gerät).
 */
export function quietHoursSuppressesForUser(params: {
  reason: NotifyReason;
  window: QuietHoursPrefs;
  userId: number | null;
  presenceLookup: (userId: number) => PresenceStatus | null;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  return quietHoursSuppresses({
    reason: params.reason,
    nowHm: zurichHm(now),
    ymd: zurichYmd(now),
    window: params.window,
    presenceStatus:
      params.userId != null ? params.presenceLookup(params.userId) : null,
  });
}
