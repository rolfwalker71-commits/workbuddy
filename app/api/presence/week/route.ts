import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { sanitizeYmd } from "@/lib/mari/ttv";
import { PRESENCE_STATUSES } from "@/lib/presence/status";
import { setOwnWeekStatus } from "@/lib/presence/day-status";
import { mondayOfWeek } from "@/lib/presence/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  fromYmd: z.string().min(8).max(10),
  days: z.array(
    z.object({
      ymd: z.string().min(8).max(10),
      status: z.enum(PRESENCE_STATUSES),
    })
  ),
});

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const fromYmd = sanitizeYmd(parsed.data.fromYmd);
  if (!fromYmd || !mondayOfWeek(fromYmd)) {
    return NextResponse.json({ error: "Datum ungültig." }, { status: 400 });
  }

  try {
    const result = setOwnWeekStatus({
      userId,
      fromYmd,
      days: parsed.data.days,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
