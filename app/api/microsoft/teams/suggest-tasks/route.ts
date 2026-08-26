import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { suggestTasksFromChatMessages } from "@/lib/microsoft/chat-task-suggestions";
import { getMeetingTranscript } from "@/lib/microsoft/meeting-transcripts";
import { listChannelMessages } from "@/lib/microsoft/teams-channels";
import { listTeamsChatMessages } from "@/lib/microsoft/teams-chats";
import {
  hasMicrosoftChannelMessageScope,
  hasMicrosoftChatMessageScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  chatId: z.string().trim().min(1).max(400).optional(),
  teamId: z.string().trim().min(1).max(400).optional(),
  channelId: z.string().trim().min(1).max(400).optional(),
  eventId: z.string().trim().min(1).max(400).optional(),
  joinUrl: z.string().trim().url().max(2000).optional(),
  issueId: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
      { status: 400 }
    );
  }

  if (
    !body.chatId &&
    !body.teamId &&
    !body.channelId &&
    !body.eventId &&
    !body.joinUrl &&
    body.issueId == null
  ) {
    return NextResponse.json(
      { error: "chatId, teamId+channelId, eventId, joinUrl oder issueId nötig." },
      { status: 400 }
    );
  }

  try {
    if (body.teamId || body.channelId) {
      if (!body.teamId || !body.channelId) {
        return NextResponse.json(
          { error: "teamId und channelId gehören zusammen." },
          { status: 400 }
        );
      }
      if (!hasMicrosoftChannelMessageScope(userId)) {
        return NextResponse.json(
          {
            error:
              "Kanal-Recht fehlt. Unter Konto Microsoft 365 neu verbinden.",
            needsReconnect: true,
          },
          { status: 403 }
        );
      }
      const messages = await listChannelMessages(
        userId,
        body.teamId,
        body.channelId
      );
      const { suggestions, usedAi } = await suggestTasksFromChatMessages(
        messages,
        { label: "Teams-Kanal" }
      );
      return NextResponse.json({
        ok: true,
        suggestions,
        usedAi,
        source: "channel",
      });
    }

    if (body.chatId && !body.eventId && !body.joinUrl && body.issueId == null) {
      const fromMeeting = await getMeetingTranscript({
        userId,
        chatId: body.chatId,
      });
      if (fromMeeting.text || fromMeeting.chatMessages.length > 0) {
        const fromTranscript = fromMeeting.text
          ? fromMeeting.text
              .split("\n")
              .map((line) => {
                const idx = line.indexOf(": ");
                return {
                  from: idx > 0 ? line.slice(0, idx) : null,
                  text: idx > 0 ? line.slice(idx + 2) : line,
                };
              })
              .filter((m) => m.text.trim())
          : [];
        const messages =
          fromTranscript.length > 0
            ? fromTranscript
            : fromMeeting.chatMessages;
        const { suggestions, usedAi } = await suggestTasksFromChatMessages(
          messages,
          { label: fromMeeting.subject || "Meeting" }
        );
        return NextResponse.json({
          ok: true,
          suggestions,
          usedAi,
          source: fromTranscript.length > 0 ? "transcript" : "meeting_chat",
        });
      }
      if (!hasMicrosoftChatMessageScope(userId)) {
        return NextResponse.json(
          {
            error:
              "Chat-Recht fehlt. Unter Konto Microsoft 365 neu verbinden.",
            needsReconnect: true,
          },
          { status: 403 }
        );
      }
      const messages = await listTeamsChatMessages(userId, body.chatId);
      const { suggestions, usedAi } = await suggestTasksFromChatMessages(
        messages,
        { label: "Teams-Chat" }
      );
      return NextResponse.json({
        ok: true,
        suggestions,
        usedAi,
        source: "chat",
      });
    }

    const transcript = await getMeetingTranscript({
      userId,
      eventId: body.eventId,
      joinUrl: body.joinUrl,
      chatId: body.chatId,
      issueId: body.issueId ?? null,
    });
    const fromTranscript = transcript.text
      ? transcript.text
          .split("\n")
          .map((line) => {
            const idx = line.indexOf(": ");
            return {
              from: idx > 0 ? line.slice(0, idx) : null,
              text: idx > 0 ? line.slice(idx + 2) : line,
            };
          })
          .filter((m) => m.text.trim())
      : [];
    const messages =
      fromTranscript.length > 0 ? fromTranscript : transcript.chatMessages;
    const { suggestions, usedAi } = await suggestTasksFromChatMessages(
      messages,
      { label: transcript.subject || "Meeting" }
    );
    return NextResponse.json({
      ok: true,
      suggestions,
      usedAi,
      source: fromTranscript.length > 0 ? "transcript" : "meeting_chat",
    });
  } catch (error) {
    console.warn(
      `[teams] suggest-tasks failed user=${userId} ${error instanceof Error ? error.message : "error"}`
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Aufgaben-Vorschläge fehlgeschlagen.",
      },
      { status: 502 }
    );
  }
}
