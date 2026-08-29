import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listTeamsChats } from "@/lib/microsoft/teams-chats";
import {
  hasMicrosoftChatScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { requireTeamsFeature } from "@/lib/microsoft/teams-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
  if (!hasMicrosoftChatScope(userId)) {
    return NextResponse.json(
      {
        error:
          "Chat-Recht fehlt. Unter Konto Microsoft 365 neu verbinden (Chat.Read).",
        needsReconnect: true,
      },
      { status: 403 }
    );
  }
  try {
    const chats = await listTeamsChats(userId);
    return NextResponse.json({ ok: true, chats });
  } catch (error) {
    console.warn(
      `[teams] list chats failed user=${userId} ${error instanceof Error ? error.message : "error"}`
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Chats konnten nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}
