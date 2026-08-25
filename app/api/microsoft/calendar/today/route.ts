import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { microsoftAgendaToReviewEvent } from "@/lib/microsoft/calendar-review";
import { listMicrosoftAgendaInRange } from "@/lib/microsoft/calendars";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { isDayCloseRitualId } from "@/lib/dashboard/day-close-ritual";
import { attachDayCloseRitualMs } from "@/lib/dashboard/day-close-status";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import { filterTodayEventsAfterGrace } from "@/lib/workspace/event-grace";
import { attachMariToEvents } from "@/lib/workspace/event-mari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  try {
    const today = zurichYmd();
    const { events: agenda } = await listMicrosoftAgendaInRange(
      userId,
      today,
      today
    );
    const raw = agenda.map(microsoftAgendaToReviewEvent);
    const withRitual = await attachDayCloseRitualMs(userId, today, raw);
    const events = await attachMariToEvents(
      userId,
      filterTodayEventsAfterGrace(withRitual, today, zurichHm()).map((e) => ({
        ...e,
        provider: "microsoft" as const,
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
