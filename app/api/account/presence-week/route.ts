import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { PRESENCE_STATUSES } from "@/lib/presence/status";
import { parsePresenceDefaultWeek } from "@/lib/presence/default-week";
import {
  getUserPresenceDefaultWeek,
  setUserPresenceDefaultWeek,
} from "@/lib/presence/default-week-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DaySchema = z.enum(PRESENCE_STATUSES).nullable().optional();

const PutSchema = z.object({
  week: z.object({
    mon: DaySchema,
    tue: DaySchema,
    wed: DaySchema,
    thu: DaySchema,
    fri: DaySchema,
  }),
});

function noAppUser() {
  return NextResponse.json(
    { error: "Kein App-User für dieses Konto." },
    { status: 400 }
  );
}

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) return noAppUser();
  return NextResponse.json({ week: getUserPresenceDefaultWeek(userId) });
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) return noAppUser();
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    const week = setUserPresenceDefaultWeek(
      userId,
      parsePresenceDefaultWeek(parsed.data.week)
    );
    return NextResponse.json({ ok: true, week });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
