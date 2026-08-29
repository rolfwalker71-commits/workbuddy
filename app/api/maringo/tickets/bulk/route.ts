import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { deleteTicket, patchTicketFields } from "@/lib/mari/tickets";
import {
  MAX_BULK_TICKET_IDS,
  sanitizeBulkIssueIds,
  summarizeBulkResults,
  type TicketBulkItemResult,
} from "@/lib/mari/ticket-bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BulkSchema = z.object({
  issueIds: z.array(z.number().int().positive()).min(1).max(MAX_BULK_TICKET_IDS),
  action: z.enum(["delete", "status", "dueDate"]),
  status: z.number().int().positive().optional(),
  dueDate: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+)?$/),
      z.null(),
      z.literal(""),
    ])
    .optional(),
});

export async function POST(request: Request) {
  return withMariModule(async () => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert." },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = BulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const issueIds = sanitizeBulkIssueIds(parsed.data.issueIds);
    if (issueIds.length === 0) {
      return NextResponse.json(
        { error: "Keine gültigen Ticket-IDs." },
        { status: 400 }
      );
    }

    if (parsed.data.action === "status" && parsed.data.status == null) {
      return NextResponse.json(
        { error: "Status fehlt." },
        { status: 400 }
      );
    }
    if (parsed.data.action === "dueDate" && parsed.data.dueDate === undefined) {
      return NextResponse.json(
        { error: "Stichtag fehlt." },
        { status: 400 }
      );
    }

    const results: TicketBulkItemResult[] = [];
    for (const issueId of issueIds) {
      try {
        if (parsed.data.action === "delete") {
          await deleteTicket(issueId);
        } else if (parsed.data.action === "status") {
          await patchTicketFields(issueId, { status: parsed.data.status });
        } else {
          const due =
            parsed.data.dueDate === "" ? null : parsed.data.dueDate ?? null;
          await patchTicketFields(issueId, { dueDate: due });
        }
        results.push({ issueId, ok: true });
      } catch (err) {
        const message =
          err instanceof MariApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        results.push({ issueId, ok: false, error: message });
      }
    }

    const { succeeded, failed } = summarizeBulkResults(results);
    return NextResponse.json({
      ok: failed.length === 0,
      action: parsed.data.action,
      count: succeeded.length,
      succeeded,
      failed,
    });
  });
}
