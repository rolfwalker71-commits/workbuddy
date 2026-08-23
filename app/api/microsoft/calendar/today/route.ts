import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listMicrosoftEventsToday } from "@/lib/microsoft/calendar-review";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { isDayCloseRitualId } from "@/lib/dashboard/day-close-ritual";
import { attachDayCloseRitualMs } from "@/lib/dashboard/day-close-status";
import { zurichYmd } from "@/lib/microsoft/time";

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
    const raw = await listMicrosoftEventsToday(userId);
    const events = await attachDayCloseRitualMs(userId, zurichYmd(), raw);
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
