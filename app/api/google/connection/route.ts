import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getConnectedGoogleEmail,
  getGoogleOauthClientCredentials,
  getGoogleOauthRedirectUri,
  hasGmailModifyScope,
  hasGoogleCalendarEventsWriteScope,
  hasGoogleCalendarScope,
  hasGoogleTasksScope,
  isGoogleMailConnected,
  isGoogleOauthConfigured,
  resolveGoogleUserId,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per logged-in app user: Google link status (no Client-Secret). */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  const connected = isGoogleMailConnected(userId);
  const creds = userId != null ? getGoogleOauthClientCredentials(userId) : null;
  return NextResponse.json({
    googleOauthConfigured: isGoogleOauthConfigured(userId),
    googleOauthClientId: creds?.clientId || null,
    googleOauthRedirectUri: getGoogleOauthRedirectUri(request),
    ownerUserId: userId,
    connected,
    connectedEmail: getConnectedGoogleEmail(userId),
    hasCalendarScope: connected ? hasGoogleCalendarScope(userId) : false,
    hasCalendarEventsWrite: connected
      ? hasGoogleCalendarEventsWriteScope(userId)
      : false,
    hasTasksScope: connected ? hasGoogleTasksScope(userId) : false,
    hasGmailModify: connected ? hasGmailModifyScope(userId) : false,
  });
}
