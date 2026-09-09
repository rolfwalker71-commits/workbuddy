import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import {
  isValidBatchDraftYmd,
  parseBatchDraftDay,
  pruneBatchDraftDay,
  readBatchDraftDay,
  writeBatchDraftDay,
} from "@/lib/mari/batch-hours-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Row ids still on the day — anything else is pruned. */
  eventIds: z.array(z.string().trim().min(1).max(400)).max(60),
  drafts: z.record(z.string(), z.unknown()),
});

export async function GET(request: Request) {
  return withMariModule(async (auth) => {
    if (auth.userId == null) {
      return NextResponse.json({ drafts: {} });
    }
    const date = new URL(request.url).searchParams.get("date") || "";
    if (!isValidBatchDraftYmd(date)) {
      return NextResponse.json({ error: "Ungültiges Datum." }, { status: 400 });
    }
    return NextResponse.json({ drafts: readBatchDraftDay(auth.userId, date) });
  });
}

export async function PUT(request: Request) {
  return withMariModule(async (auth) => {
    if (auth.userId == null) {
      return NextResponse.json({ error: "Kein App-User." }, { status: 400 });
    }
    let body: z.infer<typeof PutSchema>;
    try {
      body = PutSchema.parse(await request.json());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
        { status: 400 }
      );
    }
    const parsed = parseBatchDraftDay(JSON.stringify(body.drafts));
    const pruned = pruneBatchDraftDay(parsed, body.eventIds);
    writeBatchDraftDay(auth.userId, body.date, pruned);
    return NextResponse.json({ ok: true, drafts: pruned });
  });
}
