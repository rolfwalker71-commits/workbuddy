import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import {
  listWatchedTickets,
  setTicketWatched,
  MARI_TICKET_WATCH_MAX,
} from "@/lib/mari/ticket-watch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  issueId: z.number().int().positive(),
  watched: z.boolean(),
  title: z.string().max(200).nullable().optional(),
});

export async function GET() {
  return withMariModule(async (auth) => {
    if (auth.userId == null) {
      // Der env-Admin hat keine Benutzerzeile — eine Beobachtungsliste je
      // Benutzer ergibt für ihn keinen Sinn.
      return NextResponse.json({ items: [], max: MARI_TICKET_WATCH_MAX });
    }
    return NextResponse.json({
      items: listWatchedTickets(auth.userId),
      max: MARI_TICKET_WATCH_MAX,
    });
  });
}

export async function PUT(request: Request) {
  return withMariModule(async (auth) => {
    if (auth.userId == null) {
      return NextResponse.json(
        { error: "Beobachten ist nur für angelegte Benutzer verfügbar." },
        { status: 400 }
      );
    }
    const parsed = PutSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const result = setTicketWatched(
      auth.userId,
      parsed.data.issueId,
      parsed.data.watched,
      parsed.data.title ?? null
    );
    if (result.limitHit) {
      return NextResponse.json(
        {
          error: `Höchstens ${MARI_TICKET_WATCH_MAX} beobachtete Tickets — bitte zuerst eines abwählen.`,
          ...result,
          max: MARI_TICKET_WATCH_MAX,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ...result, max: MARI_TICKET_WATCH_MAX });
  });
}
