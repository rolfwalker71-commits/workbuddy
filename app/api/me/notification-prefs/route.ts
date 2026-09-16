import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import {
  ALL_NOTIFY_REASONS,
  LEGACY_NOTIFY_REASONS,
  NOTIFY_REASON_DOMAIN,
  NOTIFY_REASON_LABELS,
  notifyReasonDefaultEnabled,
  getNotificationPrefsForAuth,
  notifyReasonVisibleForModules,
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
  mariTicketScopes: z
    .object({
      assigned: z.boolean().optional(),
      allNew: z.boolean().optional(),
      watched: z.boolean().optional(),
    })
    .optional(),
  quietHours: z
    .object({
      enabled: z.boolean().optional(),
      startHm: z.string().optional(),
      endHm: z.string().optional(),
      weekdaysOnly: z.boolean().optional(),
    })
    .optional(),
});

function catalog(modules: readonly string[], isAdmin: boolean) {
  return ALL_NOTIFY_REASONS.filter(
    (reason) =>
      // Ersetzte Arten steuern nichts mehr — ein toter Schalter verwirrt nur.
      !LEGACY_NOTIFY_REASONS.has(reason) &&
      notifyReasonVisibleForModules(reason, modules, isAdmin)
  ).map((reason) => ({
    reason,
    label: NOTIFY_REASON_LABELS[reason],
    domain: NOTIFY_REASON_DOMAIN[reason],
    defaultOn: notifyReasonDefaultEnabled(reason),
  }));
}

function mariScopesVisible(
  modules: readonly string[],
  isAdmin: boolean
): boolean {
  return isAdmin || modules.includes("maringo");
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    prefs: getNotificationPrefsForAuth(auth),
    catalog: catalog(auth.modules, auth.isAdmin),
    mariScopesVisible: mariScopesVisible(auth.modules, auth.isAdmin),
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
  return NextResponse.json({
    prefs,
    catalog: catalog(auth.modules, auth.isAdmin),
    mariScopesVisible: mariScopesVisible(auth.modules, auth.isAdmin),
  });
}
