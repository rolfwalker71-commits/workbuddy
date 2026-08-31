import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { parseCalendarDateRange } from "@/lib/calendar/date-range";
import { listPublicHolidayDays } from "@/lib/presence/public-holidays-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const parsed = parseCalendarDateRange(
    url.searchParams.get("from"),
    url.searchParams.get("to")
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await listPublicHolidayDays({
      from: parsed.range.from,
      to: parsed.range.to,
    });
    return NextResponse.json({
      from: parsed.range.from,
      to: parsed.range.to,
      mailbox: result.mailbox,
      days: result.days,
      reason: result.reason ?? null,
      probe: result.probe,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
