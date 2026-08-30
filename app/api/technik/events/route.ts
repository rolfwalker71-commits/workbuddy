import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { parseCalendarDateRange } from "@/lib/calendar/date-range";
import { listTechUpgradeEvents } from "@/lib/technik/tech-upgrades-calendar";
import { requireTechnikNav } from "@/lib/technik/technik-prefs";
import { resolveAppUserId } from "@/lib/users/resolve-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const blocked = requireTechnikNav(resolveAppUserId(auth));
  if (blocked) return blocked;

  const url = new URL(request.url);
  const parsed = parseCalendarDateRange(
    url.searchParams.get("from"),
    url.searchParams.get("to")
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await listTechUpgradeEvents({
      from: parsed.range.from,
      to: parsed.range.to,
    });
    return NextResponse.json({
      from: parsed.range.from,
      to: parsed.range.to,
      mailbox: result.mailbox,
      events: result.events,
      reason: result.reason ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
