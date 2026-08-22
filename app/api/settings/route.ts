import { NextResponse } from "next/server";
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
import { getMariBaseUrl } from "@/lib/mari/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const clientId = getMicrosoftOauthClientId();
  return NextResponse.json({
    appPublicUrl: getAppPublicUrlSetting(),
    microsoftOauthConfigured: isMicrosoftOauthConfigured(),
    microsoftOauthClientIdMasked: maskToken(clientId),
    microsoftOauthTenant: getMicrosoftOauthTenant(),
    microsoftOauthRedirectUri: getMicrosoftOauthRedirectUri(request),
    mariBaseUrl: getMariBaseUrl(),
  });
}
