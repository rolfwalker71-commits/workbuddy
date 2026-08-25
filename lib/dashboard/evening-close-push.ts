import { getSetting, setSetting } from "@/lib/db/migrations";
import { isZurichWeekday } from "@/lib/dashboard/day-close-ritual";
import { getDayCloseSchedule } from "@/lib/dashboard/day-close-prefs";
import {
  DEFAULT_DAY_CLOSE_START_HM,
  hmToMinutes,
  parseDayCloseStartHm,
} from "@/lib/dashboard/day-close-prefs-parse";
import {
  loadTodayCalendarForRitual,
  resolveDayCloseRitualStatus,
} from "@/lib/dashboard/day-close-status";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import { notifyAppChange } from "@/lib/realtime/notify";
import type { AppModule } from "@/lib/users/modules";
import {
  getAppUserById,
  listActiveUsersWithModule,
  userHasModule,
} from "@/lib/users/queries";

export const EVENING_DIGEST_REASON = "evening_digest" as const;

function lastSentKey(userId: number): string {
  return `evening_digest_last_sent_u${userId}`;
}

export function zurichNowClock(d = new Date()): {
  todayIso: string;
  hour: number;
  minute: number;
} {
  const hm = zurichHm(d);
  const [hourRaw, minuteRaw] = hm.split(":");
  return {
    todayIso: zurichYmd(d),
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
  };
}

/** One-hour window starting at the user's Tagesabschluss (default 18:30). */
export function inEveningCloseWindow(
  hour: number,
  minute: number,
  startHm = DEFAULT_DAY_CLOSE_START_HM
): boolean {
  const start = hmToMinutes(parseDayCloseStartHm(startHm));
  const mins = hour * 60 + minute;
  return mins >= start && mins < start + 60;
}

export function listEveningCloseUsers(): Array<{ id: number }> {
  const seen = new Set<number>();
  const out: Array<{ id: number }> = [];
  for (const module of ["microsoft", "google"] as const satisfies AppModule[]) {
    for (const user of listActiveUsersWithModule(module)) {
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      out.push({ id: user.id });
    }
  }
  return out;
}

function calendarHref(userId: number): string {
  try {
    const user = getAppUserById(userId);
    const admin = Boolean(user?.is_admin);
    if (userHasModule(userId, "microsoft", admin)) {
      return "/microsoft?tab=calendar";
    }
    if (userHasModule(userId, "google", admin)) {
      return "/google?tab=calendar";
    }
  } catch {
    /* fall through */
  }
  return "/";
}

export async function dispatchEveningCloseForUser(
  userId: number,
  todayIso: string
): Promise<boolean> {
  const calendar = await loadTodayCalendarForRitual(userId, todayIso).catch(
    () => []
  );
  const ritual = await resolveDayCloseRitualStatus(userId, todayIso, calendar);
  const ritualBits = [
    ritual.calendarOpen > 0
      ? `${ritual.calendarOpen} Termin(e) prüfen`
      : "Termine geprüft",
    ritual.googleDayDone === false ? "Gmail-Tagesanalyse offen" : null,
    ritual.microsoftDayDone === false ? "Outlook-Tagesanalyse offen" : null,
    ritual.googleDayDone === true ? "Gmail-Analyse ✓" : null,
    ritual.microsoftDayDone === true ? "Outlook-Analyse ✓" : null,
    ritual.mariHoursPending != null && ritual.mariHoursPending > 0
      ? `${ritual.mariHoursPending} Stunden-Vorschlag${
          ritual.mariHoursPending === 1 ? "" : "e"
        }`
      : null,
  ].filter(Boolean);
  notifyAppChange({
    domain: "app",
    reason: EVENING_DIGEST_REASON,
    headline: "Tagesabschluss",
    detail: `Tagesabschluss ${getDayCloseSchedule(userId).startHm}: ${ritualBits.join(" · ")}`,
    title: "Tagesabschluss",
    href: calendarHref(userId),
    source: "workbuddy",
    aiIconUrl: null,
    category: "briefing",
    meta: "evening",
    ownerUserId: userId,
    ownerKey: `user:${userId}`,
  });
  setSetting(lastSentKey(userId), todayIso);
  return true;
}

/**
 * Once per weekday in each user's 60-min Tagesabschluss window.
 * No morning briefing, no weekend digest.
 */
export async function maybeDispatchEveningClose(d = new Date()): Promise<{
  sent: number;
  skipped: string;
}> {
  const { todayIso, hour, minute } = zurichNowClock(d);
  if (!isZurichWeekday(todayIso)) {
    return { sent: 0, skipped: "weekend" };
  }
  let sent = 0;
  for (const user of listEveningCloseUsers()) {
    const startHm = getDayCloseSchedule(user.id).startHm;
    if (!inEveningCloseWindow(hour, minute, startHm)) continue;
    if (getSetting(lastSentKey(user.id)) === todayIso) continue;
    try {
      await dispatchEveningCloseForUser(user.id, todayIso);
      sent += 1;
    } catch (error) {
      console.warn(
        "[evening-close] push failed:",
        user.id,
        error instanceof Error ? error.message : error
      );
    }
  }
  return { sent, skipped: sent ? "ok" : "already" };
}
