import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { getAppUserById } from "@/lib/users/queries";
import { parseUserOrganization } from "@/lib/users/organization";
import { sanitizeYmd } from "@/lib/mari/ttv";
import { PRESENCE_STATUSES } from "@/lib/presence/status";
import { setDelegatedDayStatus } from "@/lib/presence/day-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  userId: z.number().int().positive(),
  ymd: z.string().min(8).max(10),
  status: z.enum(PRESENCE_STATUSES),
});

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const actorUserId = resolveAppUserId(auth);
  if (actorUserId == null) {
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

  const actor = getAppUserById(actorUserId);
  if (!actor) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const row = setDelegatedDayStatus({
      actor: {
        userId: actorUserId,
        isAdmin: auth.isAdmin || Boolean(actor.is_admin),
        canManagePresence: Boolean(actor.can_manage_presence),
        organization: parseUserOrganization(actor.organization),
      },
      targetUserId: parsed.data.userId,
      ymd,
      status: parsed.data.status,
    });
    return NextResponse.json({ ok: true, ...row });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden")
      ? 404
      : message.includes("Berechtigung")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
