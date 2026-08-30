import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { parseUserOrganization } from "@/lib/users/organization";
import { sanitizeYmd } from "@/lib/mari/ttv";
import { zurichYmd } from "@/lib/microsoft/time";
import { listPresenceToday } from "@/lib/presence/day-status";
import { syncOofPresenceForConnectedUsers } from "@/lib/presence/oof-sync";
import { syncVacationCalendarPresence } from "@/lib/presence/vacation-calendar";
import { withTimeout } from "@/lib/dashboard/with-timeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const ymdRaw = url.searchParams.get("ymd");
  const orgRaw = url.searchParams.get("organization");
  const ymd = ymdRaw ? sanitizeYmd(ymdRaw) : zurichYmd();
  if (ymdRaw && !ymd) {
    return NextResponse.json({ error: "Datum ungültig." }, { status: 400 });
  }
  if (orgRaw && orgRaw.trim() && !parseUserOrganization(orgRaw)) {
    return NextResponse.json(
      { error: "Organisation ungültig." },
      { status: 400 }
    );
  }

  try {
    const day = ymd || zurichYmd();
    await Promise.all([
      withTimeout(syncOofPresenceForConnectedUsers(day), 8000, null),
      withTimeout(syncVacationCalendarPresence(day), 8000, null),
    ]);
    return NextResponse.json(
      listPresenceToday({
        ymd: day,
        organization: parseUserOrganization(orgRaw),
        viewerUserId: resolveAppUserId(auth),
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
