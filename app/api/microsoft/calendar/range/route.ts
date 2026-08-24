import { NextResponse } from "next/server";
import { parseCalendarDateRange } from "@/lib/calendar/date-range";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listMicrosoftAgendaInRange } from "@/lib/microsoft/calendars";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const parsed = parseCalendarDateRange(
    url.searchParams.get("from"),
    url.searchParams.get("to")
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { events } = await listMicrosoftAgendaInRange(
      userId,
      parsed.range.from,
      parsed.range.to
    );
    return NextResponse.json({
      from: parsed.range.from,
      to: parsed.range.to,
      days: parsed.range.days,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        title: e.summary,
        date: e.date,
        time: e.time,
        endTime: e.endTime,
        location: e.location,
        description: e.description,
        meetUrl: e.meetUrl,
        calendarType: e.type,
        calendarName: e.calendarName,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
