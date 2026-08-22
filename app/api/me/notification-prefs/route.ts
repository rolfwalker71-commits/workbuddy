import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import {
  ALL_NOTIFY_REASONS,
  NOTIFY_REASON_DOMAIN,
  NOTIFY_REASON_LABELS,
  getNotificationPrefsForAuth,
  saveNotificationPrefsForAuth,
} from "@/lib/realtime/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  enabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  desktopEnabled: z.boolean().optional(),
  durationSec: z.number().int().min(3).max(60).optional(),
  events: z.record(z.string(), z.boolean()).optional(),
});

function catalog() {
  return ALL_NOTIFY_REASONS.map((reason) => ({
    reason,
    label: NOTIFY_REASON_LABELS[reason],
    domain: NOTIFY_REASON_DOMAIN[reason],
  }));
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    prefs: getNotificationPrefsForAuth(auth),
    catalog: catalog(),
  });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const prefs = saveNotificationPrefsForAuth(auth, parsed.data);
  return NextResponse.json({ prefs, catalog: catalog() });
}
