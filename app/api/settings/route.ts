import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getAppPublicUrlSetting } from "@/lib/app-url";
import { maskToken } from "@/lib/utils/format";
import {
  getMicrosoftOauthClientId,
  getMicrosoftOauthRedirectUri,
  getMicrosoftOauthTenant,
  isMicrosoftOauthConfigured,
} from "@/lib/microsoft/oauth";
import {
  getMariBaseUrl,
  getMariRestUsername,
} from "@/lib/mari/settings";
import {
  isTeamsModuleEnabled,
  setTeamsModuleEnabled,
} from "@/lib/microsoft/teams-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  teamsModuleEnabled: z.boolean().optional(),
});

function settingsPayload(request: Request) {
  const clientId = getMicrosoftOauthClientId();
  return {
    appPublicUrl: getAppPublicUrlSetting(),
    microsoftOauthConfigured: isMicrosoftOauthConfigured(),
    microsoftOauthClientIdMasked: maskToken(clientId),
    microsoftOauthTenant: getMicrosoftOauthTenant(),
    microsoftOauthRedirectUri: getMicrosoftOauthRedirectUri(request),
    mariBaseUrl: getMariBaseUrl(),
    mariRestUsernameMasked: maskToken(getMariRestUsername()),
    mariRestConfigured: Boolean(getMariRestUsername()),
    teamsModuleEnabled: isTeamsModuleEnabled(),
  };
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(settingsPayload(request));
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  if (parsed.data.teamsModuleEnabled !== undefined) {
    setTeamsModuleEnabled(parsed.data.teamsModuleEnabled);
  }
  return NextResponse.json(settingsPayload(request));
}
