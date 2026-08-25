import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import {
  getDayCloseSchedule,
  saveDayCloseStartHm,
} from "@/lib/dashboard/day-close-prefs";
import { DAY_CLOSE_DURATION_MINUTES } from "@/lib/dashboard/day-close-prefs-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  startHm: z.string().min(4).max(5),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für dieses Konto." },
      { status: 400 }
    );
  }
  const schedule = getDayCloseSchedule(userId);
  return NextResponse.json({
    startHm: schedule.startHm,
    endHm: schedule.endHm,
    durationMinutes: DAY_CLOSE_DURATION_MINUTES,
  });
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für dieses Konto." },
      { status: 400 }
    );
  }
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Startzeit als HH:MM angeben." },
      { status: 400 }
    );
  }
  const schedule = saveDayCloseStartHm(userId, parsed.data.startHm);
  return NextResponse.json({
    startHm: schedule.startHm,
    endHm: schedule.endHm,
    durationMinutes: DAY_CLOSE_DURATION_MINUTES,
  });
}
