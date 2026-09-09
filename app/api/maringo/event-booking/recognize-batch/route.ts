import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { hasMariConfig } from "@/lib/mari/config";
import { recognizeEventBooking } from "@/lib/mari/event-booking";
import { classifyEventMeetingKind } from "@/lib/mari/event-booking-ref";
import { mapWithConcurrency } from "@/lib/utils/map-concurrency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same recognition the single event card does lazily, for a whole day in one
 * request — the batch dialog would otherwise fire one call per row.
 */
const BatchSchema = z.object({
  events: z
    .array(
      z.object({
        eventId: z.string().trim().min(1).max(400),
        title: z.string().trim().max(300),
        attendeeEmails: z.array(z.string().trim().max(200)).max(20).optional(),
      })
    )
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert.", results: [] },
        { status: 503 }
      );
    }
    let body: z.infer<typeof BatchSchema>;
    try {
      body = BatchSchema.parse(await request.json());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
        { status: 400 }
      );
    }

    // Each recognition is its own MARI round trip. Sequentially that is ~1.5s
    // per event, so a normal day took ten seconds before the list filled in.
    const results = await mapWithConcurrency(body.events, 5, async (event) => {
      const emails = event.attendeeEmails ?? [];
      if (!event.title && emails.length === 0) {
        return {
          eventId: event.eventId,
          booking: null,
          meetingKind: classifyEventMeetingKind(emails),
        };
      }
      try {
        const hit = await recognizeEventBooking({
          title: event.title,
          attendeeEmails: emails,
        });
        return {
          eventId: event.eventId,
          booking: hit.booking,
          meetingKind: hit.meetingKind,
        };
      } catch {
        // One unrecognised row must not fail the whole day.
        return {
          eventId: event.eventId,
          booking: null,
          meetingKind: classifyEventMeetingKind(emails),
        };
      }
    });

    return NextResponse.json({ results });
  });
}
