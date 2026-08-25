import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getGoogleCalendarEvent,
  markGoogleEventDone,
  rescheduleGoogleEvent,
  suggestGoogleFreeSlotsForEvent,
} from "@/lib/google/calendar-review";
import { updateGoogleCalendarEvent } from "@/lib/google/calendar-write";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { isDayCloseRitualId } from "@/lib/dashboard/day-close-ritual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("done"),
    eventId: z.string().min(1),
    calendarId: z.string().min(1),
  }),
  z.object({
    action: z.literal("suggest_slots"),
    eventId: z.string().min(1),
    calendarId: z.string().min(1),
    rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    durationMinutes: z.number().int().min(15).max(240).optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    eventId: z.string().min(1),
    calendarId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z.string().regex(/^\d{2}:\d{2}$/),
    endHm: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  z.object({
    action: z.literal("update"),
    eventId: z.string().min(1),
    calendarId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .nullable(),
    endHm: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .nullable(),
    allDay: z.boolean().optional(),
    location: z.string().trim().max(300).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
  }),
]);

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("google");
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google Workspace nicht verbunden." },
      { status: 400 }
    );
  }

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

  if (
    isDayCloseRitualId(body.eventId) ||
    body.calendarId === "buddy-ritual"
  ) {
    return NextResponse.json(
      { error: "Virtueller Tagesabschluss — nicht in Google speichern." },
      { status: 400 }
    );
  }

  try {
    if (body.action === "done") {
      const event = await markGoogleEventDone(
        userId,
        body.calendarId,
        body.eventId,
        request
      );
      return NextResponse.json({ ok: true, event });
    }
    if (body.action === "suggest_slots") {
      const event = await getGoogleCalendarEvent(
        userId,
        body.calendarId,
        body.eventId,
        request
      );
      const slots = await suggestGoogleFreeSlotsForEvent(userId, event, {
        rangeStart: body.rangeStart,
        rangeEnd: body.rangeEnd,
        durationMinutes: body.durationMinutes,
        request,
      });
      return NextResponse.json({ ok: true, event, slots });
    }
    if (body.action === "update") {
      const allDay = Boolean(body.allDay) || !body.startHm;
      const event = await updateGoogleCalendarEvent(
        userId,
        {
          eventId: body.eventId,
          calendarId: body.calendarId,
          title: body.title,
          startDate: body.date,
          startTime: allDay ? null : body.startHm,
          endDate: body.date,
          endTime: allDay ? null : body.endHm,
          allDay,
          location: body.location,
          description: body.notes,
        },
        request
      );
      return NextResponse.json({ ok: true, event });
    }
    const event = await rescheduleGoogleEvent(
      userId,
      body.calendarId,
      body.eventId,
      {
        date: body.date,
        startHm: body.startHm,
        endHm: body.endHm,
      },
      request
    );
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
