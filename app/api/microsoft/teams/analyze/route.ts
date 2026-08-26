import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireModule,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { hasChatKey } from "@/lib/ai/client";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  TEAMS_DAY_CHAT_LIMIT,
  TEAMS_DAY_MESSAGES_PER_CHAT,
  analyzeTeamsThreads,
  chatsActiveOnZurichDay,
  emptyTeamsAnalysis,
  filterMessagesForZurichDay,
  type TeamsThreadForAnalysis,
} from "@/lib/microsoft/analyze-teams-chat";
import { listChannelMessages } from "@/lib/microsoft/teams-channels";
import { listTeamsChatMessages, listTeamsChats } from "@/lib/microsoft/teams-chats";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  hasMicrosoftChannelMessageScope,
  hasMicrosoftChatMessageScope,
  hasMicrosoftChatScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const BodySchema = z.object({
  scope: z.enum(["thread", "day"]).optional().default("thread"),
  chatId: z.string().trim().min(1).max(400).optional(),
  teamId: z.string().trim().min(1).max(400).optional(),
  channelId: z.string().trim().min(1).max(400).optional(),
});

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () =>
      worker()
    )
  );
  return out;
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  return runWithRequestSecrets(auth, async () => {
    const userId = resolveMicrosoftUserId(auth);
    if (userId == null || !isMicrosoftConnected(userId)) {
      return NextResponse.json(
        { error: "Microsoft 365 nicht verbunden." },
        { status: 400 }
      );
    }
    if (!hasChatKey()) {
      return NextResponse.json(
        { error: "Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API)." },
        { status: 400 }
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

    const todayIso = zurichYmd();

    try {
      if (body.scope === "day") {
        if (!hasMicrosoftChatScope(userId) || !hasMicrosoftChatMessageScope(userId)) {
          return NextResponse.json(
            {
              error:
                "Chat-Recht fehlt. Unter Konto Microsoft 365 neu verbinden (Chat.Read + ChatMessage.Read).",
              needsReconnect: true,
            },
            { status: 403 }
          );
        }
        const listed = await listTeamsChats(userId, { top: 40 });
        const todays = chatsActiveOnZurichDay(listed, todayIso).slice(
          0,
          TEAMS_DAY_CHAT_LIMIT
        );
        if (todays.length === 0) {
          return NextResponse.json({
            ok: true,
            usedAi: false,
            scope: "day",
            today: todayIso,
            chatsConsidered: listed.length,
            chatsAnalyzed: 0,
            analysis: emptyTeamsAnalysis(
              "Heute keine Chat-Aktivität in der geladenen Liste."
            ),
          });
        }
        const threads = (
          await mapLimit(todays, 4, async (chat) => {
            try {
              const messages = await listTeamsChatMessages(userId, chat.id, {
                top: TEAMS_DAY_MESSAGES_PER_CHAT,
              });
              const todayMsgs = filterMessagesForZurichDay(messages, todayIso);
              if (todayMsgs.length === 0) return null;
              return {
                id: chat.id,
                title: chat.title,
                messages: todayMsgs,
              } satisfies TeamsThreadForAnalysis;
            } catch {
              return null;
            }
          })
        ).filter((t): t is TeamsThreadForAnalysis => t != null);

        const analysis = await analyzeTeamsThreads(threads, {
          todayIso,
          label: `Teams-Chats von heute (${todayIso})`,
        });
        return NextResponse.json({
          ok: true,
          usedAi: true,
          scope: "day",
          today: todayIso,
          chatsConsidered: listed.length,
          chatsAnalyzed: threads.length,
          analysis,
        });
      }

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
        const analysis = await analyzeTeamsThreads(
          [
            {
              id: `${body.teamId}:${body.channelId}`,
              title: "Teams-Kanal",
              messages,
            },
          ],
          { todayIso, label: "Teams-Kanal" }
        );
        return NextResponse.json({
          ok: true,
          usedAi: true,
          scope: "thread",
          source: "channel",
          analysis,
        });
      }

      if (!body.chatId) {
        return NextResponse.json(
          { error: "chatId oder scope=day nötig." },
          { status: 400 }
        );
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
      const chats = await listTeamsChats(userId, { top: 40 });
      const chat = chats.find((c) => c.id === body.chatId);
      const messages = await listTeamsChatMessages(userId, body.chatId);
      const analysis = await analyzeTeamsThreads(
        [
          {
            id: body.chatId,
            title: chat?.title || "Teams-Chat",
            messages,
          },
        ],
        { todayIso, label: "Teams-Chat" }
      );
      return NextResponse.json({
        ok: true,
        usedAi: true,
        scope: "thread",
        source: "chat",
        analysis,
      });
    } catch (error) {
      console.warn(
        `[teams] analyze failed user=${userId} ${error instanceof Error ? error.message : "error"}`
      );
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Teams-Analyse fehlgeschlagen.",
        },
        { status: 502 }
      );
    }
  });
}
