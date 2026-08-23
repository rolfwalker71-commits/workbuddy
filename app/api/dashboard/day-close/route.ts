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
import { countPendingMailTriage } from "@/lib/mail/mail-analysis-store";
import { resolveAppUserId } from "@/lib/users/resolve-user";

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

  let mailTriageGoogle = 0;
  let mailTriageMicrosoft = 0;
  if (userId != null) {
    try {
      mailTriageGoogle = countPendingMailTriage(userId, "google");
    } catch {
      /* optional */
    }
    try {
      mailTriageMicrosoft = countPendingMailTriage(userId, "microsoft");
    } catch {
      /* optional */
    }
  }

  const maringoModule = auth.isAdmin || auth.modules.includes("maringo");
  const ticketHourSuggestions =
    ritual.mariHoursPending != null ? ritual.mariHoursPending : 0;

  return NextResponse.json({
    ok: true,
    todayIso,
    weekday,
    ritual,
    ritualComplete: isDayCloseRitualComplete(ritual),
    mailTriageGoogle,
    mailTriageMicrosoft,
    ticketHourSuggestions,
    googleConnected: ritual.googleDayDone !== null,
    microsoftConnected: ritual.microsoftDayDone !== null,
    maringoModule,
  });
}
