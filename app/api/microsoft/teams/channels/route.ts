import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listJoinedTeamsWithChannels } from "@/lib/microsoft/teams-channels";
import {
  hasMicrosoftChannelListScopes,
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
  if (!hasMicrosoftChannelListScopes(userId)) {
    return NextResponse.json(
      {
        error:
          "Team- und Kanal-Rechte fehlen. Unter Konto Microsoft 365 neu verbinden (Team.ReadBasic.All, Channel.ReadBasic.All).",
        needsReconnect: true,
      },
      { status: 403 }
    );
  }
  try {
    const teams = await listJoinedTeamsWithChannels(userId);
    return NextResponse.json({ ok: true, teams });
  } catch (error) {
    console.warn(
      `[teams] list channels failed user=${userId} ${error instanceof Error ? error.message : "error"}`
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Teams und Kanäle konnten nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}
