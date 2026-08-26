import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getMeetingTranscript } from "@/lib/microsoft/meeting-transcripts";
import {
  hasMicrosoftChatScope,
  hasMicrosoftTranscriptScope,
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
  if (!hasMicrosoftTranscriptScope(userId) && !hasMicrosoftChatScope(userId)) {
    return NextResponse.json(
      {
        error:
          "Teams-Rechte fehlen. Unter Konto Microsoft 365 neu verbinden (Chat.Read + OnlineMeetingTranscript.Read.All).",
        needsReconnect: true,
      },
      { status: 403 }
    );
  }

  const params = new URL(request.url).searchParams;
  const eventId = params.get("eventId")?.trim() || null;
  const joinUrl = params.get("joinUrl")?.trim() || null;
  const chatId = params.get("chatId")?.trim() || null;
  const calendarId = params.get("calendarId")?.trim() || null;
  const issueRaw = params.get("issueId");
  const issueId = issueRaw && /^\d+$/.test(issueRaw) ? Number(issueRaw) : null;

  if (!eventId && !joinUrl && !chatId && issueId == null) {
    return NextResponse.json(
      { error: "eventId, joinUrl, chatId oder issueId nötig." },
      { status: 400 }
    );
  }

  try {
    const transcript = await getMeetingTranscript({
      userId,
      eventId,
      joinUrl,
      chatId,
      calendarId,
      issueId,
    });
    return NextResponse.json({ ok: true, transcript });
  } catch (error) {
    console.warn(
      `[teams] transcript failed user=${userId} ${error instanceof Error ? error.message : "error"}`
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transkript konnte nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}
