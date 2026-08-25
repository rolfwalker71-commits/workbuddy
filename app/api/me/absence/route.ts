import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAuth,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { zurichYmd } from "@/lib/microsoft/time";
import { sanitizeYmd } from "@/lib/mari/ttv";
import {
  clearUserAbsence,
  getUserAbsence,
  isAbsentOn,
  listAbsencesOnDay,
  setUserAbsence,
} from "@/lib/users/absence";
import {
  createOutlookCalendarEvent,
  deleteOutlookCalendarEvent,
} from "@/lib/microsoft/mail-day-actions";
import { isMicrosoftConnected } from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  fromYmd: z.string().min(8).max(10),
  toYmd: z.string().min(8).max(10),
  message: z.string().max(200).optional().nullable(),
  createOutlook: z.boolean().optional(),
});

function payload(userId: number) {
  const today = zurichYmd();
  const self = getUserAbsence(userId);
  const colleagues = listAbsencesOnDay(today).filter((a) => a.userId !== userId);
  return {
    today,
    self: self
      ? {
          fromYmd: self.fromYmd,
          toYmd: self.toYmd,
          message: self.message,
          isAwayToday: isAbsentOn(self, today),
        }
      : null,
    colleagues: colleagues.map((a) => ({
      userId: a.userId,
      displayName: a.displayName,
      message: a.message,
    })),
  };
}

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  return NextResponse.json(payload(userId));
}

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
  const toYmd = sanitizeYmd(parsed.data.toYmd);
  if (!fromYmd || !toYmd) {
    return NextResponse.json({ error: "Zeitraum ungültig." }, { status: 400 });
  }
  return runWithRequestSecrets(auth, async () => {
    const existing = getUserAbsence(userId);
    let outlookEventId = existing?.outlookEventId ?? null;
    if (parsed.data.createOutlook !== false && isMicrosoftConnected(userId)) {
      try {
        if (outlookEventId) {
          await deleteOutlookCalendarEvent(userId, outlookEventId).catch(
            () => undefined
          );
        }
        const created = await createOutlookCalendarEvent(userId, {
          title: "Abwesend",
          date: fromYmd,
          endDate: toYmd,
          allDay: true,
          notes: parsed.data.message?.trim() || "Abwesend",
          showAs: "oof",
        });
        outlookEventId = created.id;
      } catch (err) {
        console.warn(
          "[absence] Outlook-Termin:",
          err instanceof Error ? err.message : err
        );
      }
    }
    setUserAbsence({
      userId,
      fromYmd,
      toYmd,
      message: parsed.data.message,
      outlookEventId,
    });
    return NextResponse.json(payload(userId));
  });
}

export async function DELETE() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveAppUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  return runWithRequestSecrets(auth, async () => {
    const existing = clearUserAbsence(userId);
    if (existing?.outlookEventId && isMicrosoftConnected(userId)) {
      await deleteOutlookCalendarEvent(userId, existing.outlookEventId).catch(
        () => undefined
      );
    }
    return NextResponse.json(payload(userId));
  });
}
