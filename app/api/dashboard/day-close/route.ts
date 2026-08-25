import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  isDayCloseRitualComplete,
  isZurichWeekday,
} from "@/lib/dashboard/day-close-ritual";
import {
  loadTodayCalendarForRitual,
  resolveDayCloseRitualStatus,
} from "@/lib/dashboard/day-close-status";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { getDayCloseSchedule } from "@/lib/dashboard/day-close-prefs";
import { DEFAULT_DAY_CLOSE_START_HM } from "@/lib/dashboard/day-close-prefs-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight status for the floating Tagesabschluss-Assistent (current user). */
export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = resolveAppUserId(auth);
  const todayIso = zurichYmd();
  const weekday = isZurichWeekday(todayIso);
  const hasCalendarModule =
    auth.isAdmin ||
    auth.modules.includes("microsoft") ||
    auth.modules.includes("google");
  if (!hasCalendarModule) {
    return NextResponse.json({ error: "Kein Kalender-Modul." }, { status: 403 });
  }

  const todayCalendar =
    userId != null
      ? await loadTodayCalendarForRitual(userId, todayIso).catch(() => [])
      : [];

  const ritual = await resolveDayCloseRitualStatus(
    userId,
    todayIso,
    todayCalendar
  );

  const maringoModule = auth.isAdmin || auth.modules.includes("maringo");
  const ticketHourSuggestions =
    ritual.mariHoursPending != null ? ritual.mariHoursPending : 0;
  const schedule =
    userId != null
      ? getDayCloseSchedule(userId)
      : { startHm: DEFAULT_DAY_CLOSE_START_HM, endHm: "18:45" };

  return NextResponse.json({
    ok: true,
    todayIso,
    weekday,
    startHm: schedule.startHm,
    endHm: schedule.endHm,
    ritual,
    ritualComplete: isDayCloseRitualComplete(ritual),
    ticketHourSuggestions,
    googleConnected: ritual.googleDayDone !== null,
    microsoftConnected: ritual.microsoftDayDone !== null,
    maringoModule,
  });
}
