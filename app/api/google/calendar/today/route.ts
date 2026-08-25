import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listGoogleEventsToday } from "@/lib/google/calendar-review";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { isDayCloseRitualId } from "@/lib/dashboard/day-close-ritual";
import { attachDayCloseRitualGoogle } from "@/lib/dashboard/day-close-status";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import { filterTodayEventsAfterGrace } from "@/lib/workspace/event-grace";
import { attachMariToEvents } from "@/lib/workspace/event-mari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("google");
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google Workspace nicht verbunden." },
      { status: 400 }
    );
  }
  try {
    const today = zurichYmd();
    const raw = await listGoogleEventsToday(userId, request);
    const withRitual = await attachDayCloseRitualGoogle(userId, today, raw);
    const events = await attachMariToEvents(
      userId,
      filterTodayEventsAfterGrace(withRitual, today, zurichHm()).map((e) => ({
        ...e,
        provider: "google" as const,
      }))
    );
    const cloud = events.filter((e) => !isDayCloseRitualId(e.id));
    return NextResponse.json({
      events,
      openCount: cloud.filter((e) => !e.done).length,
      doneCount: cloud.filter((e) => e.done).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
