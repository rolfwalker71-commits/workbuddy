import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { sanitizeYmd } from "@/lib/mari/ttv";
import { PRESENCE_STATUSES } from "@/lib/presence/status";
import { clearOwnDayStatus, setOwnDayStatus } from "@/lib/presence/day-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  ymd: z.string().min(8).max(10),
  status: z.enum(PRESENCE_STATUSES),
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
  const ymd = sanitizeYmd(parsed.data.ymd);
  if (!ymd) {
    return NextResponse.json({ error: "Datum ungültig." }, { status: 400 });
  }

  try {
    const row = setOwnDayStatus({
      userId,
      ymd,
      status: parsed.data.status,
    });
    return NextResponse.json({ ok: true, ...row });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Stellvertretung") || message.includes("Outlook")
      ? 409
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const url = new URL(request.url);
  const ymd = sanitizeYmd(url.searchParams.get("ymd") || "");
  if (!ymd) {
    return NextResponse.json({ error: "Datum ungültig." }, { status: 400 });
  }

  try {
    const cleared = clearOwnDayStatus(userId, ymd);
    return NextResponse.json({ ok: true, cleared });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message.includes("Stellvertretung") || message.includes("Outlook")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
