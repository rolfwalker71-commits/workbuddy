import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftChatMessageSendScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  parseTeamsReplyTarget,
  sendTeamsChannelMessage,
  sendTeamsChatMessage,
} from "@/lib/microsoft/teams-send";
import { requireTeamsFeature } from "@/lib/microsoft/teams-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
    chatId: z.string().trim().min(1).max(400).optional(),
    teamId: z.string().trim().min(1).max(400).optional(),
    channelId: z.string().trim().min(1).max(400).optional(),
    threadKey: z.string().trim().min(1).max(400).optional(),
  })
  .refine(
    (v) => Boolean(v.chatId || v.threadKey || (v.teamId && v.channelId)),
    { message: "chatId, threadKey oder teamId+channelId nötig." }
  );

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const denied = requireTeamsFeature(userId);
  if (denied) return denied;
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  if (!hasMicrosoftChatMessageSendScope(userId)) {
    return NextResponse.json(
      {
        error:
          "ChatMessage.Send fehlt. Unter Konto Microsoft 365 neu verbinden.",
        needsReconnect: true,
      },
      { status: 403 }
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

  const target = parseTeamsReplyTarget(body);
  if (!target) {
    return NextResponse.json(
      { error: "chatId, threadKey oder teamId+channelId nötig." },
      { status: 400 }
    );
  }

  try {
    const sent =
      target.kind === "chat"
        ? await sendTeamsChatMessage(userId, target.chatId, body.body)
        : await sendTeamsChannelMessage(
            userId,
            target.teamId,
            target.channelId,
            body.body
          );
    return NextResponse.json({
      ok: true,
      kind: target.kind,
      messageId: sent.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nachricht konnte nicht gesendet werden.";
    const needsReconnect = /ChatMessage\.Send|neu verbinden/i.test(message);
    console.warn(
      `[teams] reply failed user=${userId} kind=${target.kind} ${message}`
    );
    return NextResponse.json(
      { error: message, needsReconnect },
      { status: needsReconnect ? 403 : 502 }
    );
  }
}
