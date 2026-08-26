import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
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

export async function GET(request: Request) {
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
  const params = new URL(request.url).searchParams;
  const chatId = params.get("chatId")?.trim() || "";
  const teamId = params.get("teamId")?.trim() || "";
  const channelId = params.get("channelId")?.trim() || "";

  if (teamId || channelId) {
    if (!teamId || !channelId) {
      return NextResponse.json(
        { error: "teamId und channelId gehören zusammen." },
        { status: 400 }
      );
    }
    if (!hasMicrosoftChannelMessageScope(userId)) {
      return NextResponse.json(
        {
          error:
            "Kanal-Nachrichten-Recht fehlt. Unter Konto Microsoft 365 neu verbinden (ChannelMessage.Read.All).",
          needsReconnect: true,
        },
        { status: 403 }
      );
    }
    try {
      const messages = await listChannelMessages(userId, teamId, channelId);
      return NextResponse.json({
        ok: true,
        teamId,
        channelId,
        messages,
        count: messages.length,
      });
    } catch (error) {
      console.warn(
        `[teams] channel messages failed user=${userId} ${error instanceof Error ? error.message : "error"}`
      );
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Kanalnachrichten konnten nicht geladen werden.",
        },
        { status: 502 }
      );
    }
  }

  if (!hasMicrosoftChatMessageScope(userId)) {
    return NextResponse.json(
      {
        error:
          "Chat-Nachrichten-Recht fehlt. Unter Konto Microsoft 365 neu verbinden (ChatMessage.Read).",
        needsReconnect: true,
      },
      { status: 403 }
    );
  }
  if (!chatId) {
    return NextResponse.json({ error: "chatId fehlt." }, { status: 400 });
  }
  try {
    const messages = await listTeamsChatMessages(userId, chatId);
    return NextResponse.json({
      ok: true,
      chatId,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.warn(
      `[teams] messages failed user=${userId} ${error instanceof Error ? error.message : "error"}`
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nachrichten konnten nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}
