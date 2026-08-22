import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import {
  listPendingMariCalendarStamps,
  updateMariCalendarStampStatus,
} from "@/lib/mari/calendar-stamp";
import { zurichYmd } from "@/lib/microsoft/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  eventProvider: z.enum(["microsoft"]),
  eventId: z.string().trim().min(1),
  status: z.enum(["booked", "dismissed"]),
  bookedLineId: z.number().int().positive().optional().nullable(),
});

/** Pending Maringo→calendar stamps for evening time-booking review. */
export async function GET(request: Request) {
  return withMariModule(async (auth) => {

  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim() || null;
  const mode = url.searchParams.get("mode") || "evening";
  const today = zurichYmd();

  if (auth.userId == null) {
    return NextResponse.json({ ok: true, today, count: 0, suggestions: [] });
  }

  const stamps =
    mode === "day" && date
      ? listPendingMariCalendarStamps(auth.userId, { onDate: date })
      : listPendingMariCalendarStamps(auth.userId, {
          onOrBeforeDate: date || today,
        });

  return NextResponse.json({
    ok: true,
    today,
    count: stamps.length,
    suggestions: stamps.map((s) => ({
      eventProvider: s.eventProvider,
      eventId: s.eventId,
      calendarId: s.calendarId,
      issueId: s.issueId,
      eventDate: s.eventDate,
      startHm: s.startHm,
      endHm: s.endHm,
      title: s.title,
      memo: s.memo,
      hours: s.hours,
      href: `/maringo?open=${s.issueId}`,
    })),
  });
  });
}

export async function PATCH(request: Request) {
  return withMariModule(async (auth) => {

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
      { status: 400 }
    );
  }

  if (auth.userId == null) {
    return NextResponse.json({ error: "Kein App-User." }, { status: 400 });
  }
  if (body.eventProvider !== "microsoft") {
    return NextResponse.json(
      { error: "Nur Microsoft-Kalender-Stamps." },
      { status: 400 }
    );
  }
  const updated = updateMariCalendarStampStatus({
    userId: auth.userId,
    eventProvider: "microsoft",
    eventId: body.eventId,
    status: body.status,
    bookedLineId: body.bookedLineId ?? null,
  });
  if (!updated) {
    return NextResponse.json({ error: "Vorschlag nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, stamp: updated });
  });
}
