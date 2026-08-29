import { NextResponse } from "next/server";
import { z } from "zod";
import { withMariModule } from "@/lib/mari/with-module";
import { pingColleagueAboutTicket } from "@/lib/mari/ticket-ping";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z
  .object({
    colleagueUserId: z.number().int().positive().optional(),
    microsoftId: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().email().max(200).optional(),
    existingChatId: z.string().trim().min(1).max(400).optional(),
  })
  .refine(
    (v) => Boolean(v.colleagueUserId || v.microsoftId || v.email || v.existingChatId),
    { message: "Kollege wählen." }
  );

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Ticket ping via Teams 1:1 — works if Microsoft is connected, even if Teams inbox is off. */
export async function POST(request: Request, context: Ctx) {
  return withMariModule(async (auth) => {
    if (!hasMariConfig()) {
      return NextResponse.json(
        { error: "MARI nicht konfiguriert." },
        { status: 503 }
      );
    }
    const userId = resolveMicrosoftUserId(auth);
    if (userId == null || !isMicrosoftConnected(userId)) {
      return NextResponse.json(
        { error: "Microsoft 365 nicht verbunden." },
        { status: 400 }
      );
    }

    const { id: raw } = await context.params;
    const issueId = parseId(raw);
    if (!issueId) {
      return NextResponse.json({ error: "Ungültige Ticket-ID" }, { status: 400 });
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

    try {
      const result = await pingColleagueAboutTicket({
        actorUserId: userId,
        issueId,
        colleagueUserId: body.colleagueUserId,
        microsoftId: body.microsoftId,
        email: body.email,
        existingChatId: body.existingChatId,
        request,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Kollege konnte nicht informiert werden.";
      const needsReconnect = /Chat\.Create|ChatMessage\.Send|neu verbinden/i.test(
        message
      );
      const status =
        error instanceof MariApiError
          ? error.status || 502
          : needsReconnect
            ? 403
            : /nicht gefunden|selbst informieren|Kollege wählen|keine Microsoft/i.test(
                  message
                )
              ? 400
              : 502;
      console.warn(`[ticket-ping] failed user=${userId} issue=${issueId} ${message}`);
      return NextResponse.json({ error: message, needsReconnect }, { status });
    }
  });
}
