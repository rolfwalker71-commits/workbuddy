import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { createOutlookTodoTask } from "@/lib/microsoft/mail-day-actions";
import { formatSupportTodoTitle } from "@/lib/mari/analyze-ticket";
import { parseIsoDueHint } from "@/lib/mari/analyze-ticket-shared";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  title: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
  dueHint: z.string().max(40).nullable().optional(),
});

export async function POST(request: Request, context: Ctx) {
  return withMariModule(async (auth) => {
    ensureInitialized();
    const { id: raw } = await context.params;
    const issueId = Number(raw);
    if (!Number.isInteger(issueId) || issueId <= 0) {
      return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
    }

    const userId = resolveMicrosoftUserId(auth);
    if (userId == null || !isMicrosoftConnected(userId)) {
      return NextResponse.json(
        {
          error:
            "Microsoft 365 ist nicht verbunden. Unter Konto verbinden, dann als To Do übernehmen.",
        },
        { status: 400 }
      );
    }

    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }

    const title = formatSupportTodoTitle(issueId, body.title);
    const notes = [
      `Maringo-Ticket #${issueId}`,
      body.reason?.trim() || null,
      `In WorkBuddy öffnen: /maringo (Ticket ${issueId})`,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const task = await createOutlookTodoTask(userId, {
        title,
        notes,
        dueDate: parseIsoDueHint(body.dueHint),
      });
      return NextResponse.json({ ok: true, task });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "To Do konnte nicht angelegt werden.",
        },
        { status: 500 }
      );
    }
  });
}
