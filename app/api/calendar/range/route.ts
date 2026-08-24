import { NextResponse } from "next/server";
import { parseCalendarDateRange } from "@/lib/calendar/date-range";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { loadWorkspaceAgendaInRange } from "@/lib/workspace/agenda-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für diesen Login." },
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

  const loaded = await loadWorkspaceAgendaInRange(
    userId,
    parsed.range.from,
    parsed.range.to,
    { request }
  );

  if (!loaded.sources.microsoft && !loaded.sources.google) {
    return NextResponse.json(
      { error: "Weder Microsoft 365 noch Google Workspace ist verbunden." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    from: parsed.range.from,
    to: parsed.range.to,
    days: parsed.range.days,
    sources: loaded.sources,
    errors: loaded.errors,
    count: loaded.events.length,
    events: loaded.events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      endTime: e.endTime,
      location: e.location,
      description: e.description,
      meetUrl: e.meetUrl,
      calendarType: e.calendarType,
      calendarName: e.calendarName,
      provider: e.provider,
    })),
  });
}
