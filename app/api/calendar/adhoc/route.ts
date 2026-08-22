import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  appendMariBodyMarker,
  mariOutlookCategories,
  upsertMariCalendarStamp,
} from "@/lib/mari/calendar-stamp";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { suggestFreeSlotsForDuration } from "@/lib/microsoft/calendar-review";
import { createOutlookCalendarEvent } from "@/lib/microsoft/mail-day-actions";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suggest_slots"),
    durationMinutes: z.number().int().min(15).max(240),
    rangeDays: z.number().int().min(1).max(14).optional(),
    provider: z.enum(["microsoft", "auto"]).optional(),
  }),
  z.object({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z.string().regex(/^\d{2}:\d{2}$/),
    endHm: z.string().regex(/^\d{2}:\d{2}$/),
    notes: z.string().trim().max(4000).optional().nullable(),
    mariIssueId: z.number().int().positive().optional().nullable(),
    teamsMeeting: z.boolean().optional(),
    provider: z.enum(["microsoft", "auto"]).optional(),
  }),
]);

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = resolveMicrosoftUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Kein Kalender-User." }, { status: 400 });
  }

  const msOk =
    isMicrosoftConnected(userId) && hasMicrosoftCalendarScope(userId);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  try {
    if (body.action === "suggest_slots") {
      if (!msOk) {
        return NextResponse.json(
          { error: "Microsoft-Kalender nicht verbunden." },
          { status: 400 }
        );
      }
      const rangeDays = body.rangeDays ?? 7;
      const today = zurichYmd();
      const slots = await suggestFreeSlotsForDuration(userId, {
        durationMinutes: body.durationMinutes,
        fromToday: true,
        rangeStart: today,
        rangeEnd: addDaysYmd(today, rangeDays),
        maxSlots: 48,
        maxSlotsPerDay: 6,
      });
      return NextResponse.json({
        ok: true,
        provider: "microsoft",
        slots,
        durationMinutes: body.durationMinutes,
      });
    }

    if (!msOk) {
      return NextResponse.json(
        { error: "Outlook-Kalender nicht verbunden." },
        { status: 400 }
      );
    }
    const mariIssueId =
      body.mariIssueId != null && body.mariIssueId > 0
        ? body.mariIssueId
        : null;
    const rawNotes = body.notes?.trim() || null;
    const notes = mariIssueId
      ? appendMariBodyMarker(rawNotes, mariIssueId)
      : rawNotes;

    const created = await createOutlookCalendarEvent(userId, {
      title: body.title,
      date: body.date,
      startTime: body.startHm,
      endTime: body.endHm,
      notes,
      categories: mariIssueId ? mariOutlookCategories(mariIssueId) : null,
      teamsMeeting: Boolean(body.teamsMeeting),
    });
    if (mariIssueId) {
      upsertMariCalendarStamp({
        userId,
        eventProvider: "microsoft",
        eventId: created.id,
        issueId: mariIssueId,
        eventDate: body.date,
        startHm: body.startHm,
        endHm: body.endHm,
        title: body.title,
        memo: rawNotes,
      });
    }
    return NextResponse.json({
      ok: true,
      provider: "microsoft",
      event: created,
      teamsMeeting: Boolean(body.teamsMeeting),
      mariIssueId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
