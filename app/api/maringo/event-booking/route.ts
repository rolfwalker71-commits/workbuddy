import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { hasMariConfig } from "@/lib/mari/config";
import { recognizeEventBooking } from "@/lib/mari/event-booking";
import { upsertMariCalendarBookingRef } from "@/lib/mari/calendar-stamp";
import {
  applyMeetingKind,
  classifyEventMeetingKind,
  eventBookingSeriesKey,
  type EventBookingRef,
} from "@/lib/mari/event-booking-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PinSchema = z.object({
  eventId: z.string().trim().min(1).max(400),
  seriesMasterId: z.string().trim().max(400).nullable().optional(),
  iCalUId: z.string().trim().max(400).nullable().optional(),
  calendarId: z.string().trim().max(400).nullable().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHm: z.string().trim().max(8).nullable().optional(),
  endHm: z.string().trim().max(8).nullable().optional(),
  title: z.string().trim().min(1).max(300),
  attendeeEmails: z.array(z.string().trim().max(200)).max(20).optional(),
  cardCode: z.string().trim().max(50).nullable().optional(),
  customerName: z.string().trim().max(200).nullable().optional(),
  projectNumber: z.string().trim().max(40).nullable().optional(),
  projectLabel: z.string().trim().max(200).nullable().optional(),
  contractId: z.number().int().nonnegative().nullable().optional(),
  contractVisible: z.string().trim().max(40).nullable().optional(),
});

export async function GET(request: Request) {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert.", booking: null },
        { status: 503 }
      );
    }
    const url = new URL(request.url);
    const title = (url.searchParams.get("title") || "").trim();
    const emails = (url.searchParams.get("emails") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!title && emails.length === 0) {
      return NextResponse.json({
        booking: null,
        meetingKind: classifyEventMeetingKind([]),
      });
    }
    const result = await recognizeEventBooking({
      title,
      attendeeEmails: emails,
    });
    return NextResponse.json({
      booking: result.booking,
      meetingKind: result.meetingKind,
    });
  });
}

export async function POST(request: Request) {
  return withMariModule(async (auth) => {
    if (auth.userId == null) {
      return NextResponse.json({ error: "Kein App-User." }, { status: 400 });
    }
    let body: z.infer<typeof PinSchema>;
    try {
      body = PinSchema.parse(await request.json());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
        { status: 400 }
      );
    }
    const meetingKind = classifyEventMeetingKind(body.attendeeEmails);
    const booking = applyMeetingKind(
      {
        cardCode: body.cardCode || null,
        customerName: body.customerName || null,
        projectNumber: body.projectNumber || null,
        projectLabel: body.projectLabel || null,
        contractId: body.contractId ?? (meetingKind === "internal" ? 0 : null),
        contractVisible: body.contractVisible || null,
        source: "pinned",
        meetingKind,
        contractOptional: meetingKind === "internal",
      },
      meetingKind
    ) as EventBookingRef;

    const seriesKey = eventBookingSeriesKey({
      eventId: body.eventId,
      seriesMasterId: body.seriesMasterId,
      iCalUId: body.iCalUId,
    });
    const stamp = upsertMariCalendarBookingRef({
      userId: auth.userId,
      eventId: body.eventId,
      seriesKey,
      calendarId: body.calendarId ?? null,
      eventDate: body.eventDate,
      startHm: body.startHm ?? null,
      endHm: body.endHm ?? null,
      title: body.title,
      cardCode: booking.cardCode,
      customerName: booking.customerName,
      projectNumber: booking.projectNumber,
      projectLabel: booking.projectLabel,
      contractId: booking.contractId,
      contractVisible: booking.contractVisible,
    });

    return NextResponse.json({
      ok: true,
      booking,
      stamp: { eventId: stamp.eventId, bookingPinned: stamp.bookingPinned },
      graph: false,
      graphError: null,
    });
  });
}
