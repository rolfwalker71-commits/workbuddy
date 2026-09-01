import { getSetting, setSetting } from "@/lib/db/migrations";
import { absoluteOauthRedirectUrl } from "@/lib/app-url";
import { outboundFetch } from "@/lib/net/outbound-fetch";
import type { AuthContext } from "@/lib/auth/current-user";
import { isAllowedCompanyEmail } from "@/lib/auth/allowed-email";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { findOrProvisionCompanyUser } from "@/lib/users/provision-company-user";
import type { AppUserRow } from "@/lib/users/queries";

export const MICROSOFT_OAUTH_CLIENT_ID_SETTING = "microsoft_oauth_client_id";
export const MICROSOFT_OAUTH_CLIENT_SECRET_SETTING =
  "microsoft_oauth_client_secret";
/** Entra tenant GUID, or "organizations" / "common". Default: organizations (Work/School). */
export const MICROSOFT_OAUTH_TENANT_SETTING = "microsoft_oauth_tenant";

export const MICROSOFT_OAUTH_CALLBACK_PATH = "/api/microsoft/oauth/callback";

/** Delegated Graph scopes — match Entra app registration. */
export const MICROSOFT_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Tasks.ReadWrite",
  "Chat.Read",
  "Chat.Create",
  "ChatMessage.Read",
  "ChatMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  /** Needed to resolve a calendar event’s Teams meeting from joinUrl. */
  "OnlineMeetings.Read",
  "OnlineMeetingTranscript.Read.All",
] as const;

export type MicrosoftUserTokens = {
  refreshToken: string;
  accessToken?: string | null;
  /** Unix ms */
  expiryDate?: number | null;
  email?: string | null;
  displayName?: string | null;
  /** Azure AD object id from Graph `/me` — needed for Chat.Create. */
  microsoftId?: string | null;
  scope?: string | null;
  updatedAt: string;
};

function tokensSettingKey(userId: number): string {
  return `microsoft_oauth_tokens_u${userId}`;
}

function stateSettingKey(userId: number): string {
  return `microsoft_oauth_state_u${userId}`;
}

function loginStateSettingKey(nonce: string): string {
  return `microsoft_oauth_state_login:${nonce}`;
}

export function getMicrosoftOauthClientId(): string | null {
  return process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim() || null;
}

export function getMicrosoftOauthClientSecret(): string | null {
  return process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim() || null;
}

export function getMicrosoftOauthTenant(): string {
  return (
    process.env.MICROSOFT_OAUTH_TENANT?.trim() ||
    "organizations"
  );
}

export function saveMicrosoftOauthClientId(value: string | null): void {
  setSetting(MICROSOFT_OAUTH_CLIENT_ID_SETTING, value?.trim() || null);
}

export function saveMicrosoftOauthClientSecret(value: string | null): void {
  setSetting(MICROSOFT_OAUTH_CLIENT_SECRET_SETTING, value?.trim() || null);
}

export function saveMicrosoftOauthTenant(value: string | null): void {
  const v = value?.trim() || null;
  setSetting(MICROSOFT_OAUTH_TENANT_SETTING, v);
}

export function isMicrosoftOauthConfigured(): boolean {
  return Boolean(
    getMicrosoftOauthClientId() && getMicrosoftOauthClientSecret()
  );
}

export function getMicrosoftOauthRedirectUri(
  request?: Request | null
): string {
  return absoluteOauthRedirectUrl(MICROSOFT_OAUTH_CALLBACK_PATH, request);
}

function authorizeEndpoint(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(getMicrosoftOauthTenant())}/oauth2/v2.0/authorize`;
}

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(getMicrosoftOauthTenant())}/oauth2/v2.0/token`;
}

export function readMicrosoftUserTokens(
  userId: number
): MicrosoftUserTokens | null {
  const raw = getSetting(tokensSettingKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MicrosoftUserTokens;
    if (!parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMicrosoftUserTokens(
  userId: number,
  tokens: MicrosoftUserTokens | null
): void {
  if (!tokens?.refreshToken) {
    setSetting(tokensSettingKey(userId), null);
    return;
  }
  setSetting(
    tokensSettingKey(userId),
    JSON.stringify({
      ...tokens,
      updatedAt: new Date().toISOString(),
    } satisfies MicrosoftUserTokens)
  );
}

export function clearMicrosoftUserTokens(userId: number): void {
  saveMicrosoftUserTokens(userId, null);
}

export function isMicrosoftConnected(userId: number | null): boolean {
  if (userId == null) return false;
  return Boolean(readMicrosoftUserTokens(userId)?.refreshToken);
}

function scopeSet(userId: number | null): Set<string> {
  if (userId == null) return new Set();
  const raw = readMicrosoftUserTokens(userId)?.scope || "";
  return new Set(raw.split(/[\s]+/).filter(Boolean));
}

function scopeHas(s: Set<string>, ...names: string[]): boolean {
  return names.some(
    (name) => s.has(name) || s.has(`https://graph.microsoft.com/${name}`)
  );
}

export function hasMicrosoftMailScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Mail.ReadWrite", "Mail.Read");
}

export function hasMicrosoftMailSendScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Mail.Send");
}

export function hasMicrosoftCalendarScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Calendars.ReadWrite", "Calendars.Read");
}

export function hasMicrosoftTasksScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Tasks.ReadWrite", "Tasks.Read");
}

export function hasMicrosoftChatScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Chat.Read");
}

export function hasMicrosoftChatMessageScope(userId: number | null): boolean {
  return (
    hasMicrosoftChatScope(userId) &&
    scopeHas(scopeSet(userId), "ChatMessage.Read")
  );
}

/** Send a chat message — missing until the user re-consents after this grant. */
export function hasMicrosoftChatMessageSendScope(
  userId: number | null
): boolean {
  return scopeHas(scopeSet(userId), "ChatMessage.Send");
}

/** Create a 1:1 chat — missing until the user re-consents after this grant. */
export function hasMicrosoftChatCreateScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Chat.Create");
}

export function hasMicrosoftTeamScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Team.ReadBasic.All");
}

export function hasMicrosoftChannelScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "Channel.ReadBasic.All");
}

/** Joined teams + channel names — missing until the user re-consents. */
export function hasMicrosoftChannelListScopes(
  userId: number | null
): boolean {
  return hasMicrosoftTeamScope(userId) && hasMicrosoftChannelScope(userId);
}

export function hasMicrosoftChannelMessageScope(
  userId: number | null
): boolean {
  return scopeHas(scopeSet(userId), "ChannelMessage.Read.All");
}

export function hasMicrosoftOnlineMeetingsScope(
  userId: number | null
): boolean {
  return scopeHas(scopeSet(userId), "OnlineMeetings.Read", "OnlineMeetings.ReadWrite");
}

export function hasMicrosoftTranscriptScope(userId: number | null): boolean {
  return scopeHas(scopeSet(userId), "OnlineMeetingTranscript.Read.All");
}

/** Chats + channels + transcripts after reconnect — missing until re-consent. */
export function hasMicrosoftTeamsScopes(userId: number | null): boolean {
  return (
    hasMicrosoftChatMessageScope(userId) &&
    hasMicrosoftChannelListScopes(userId) &&
    hasMicrosoftTranscriptScope(userId)
  );
}

export function getConnectedMicrosoftEmail(
  userId: number | null
): string | null {
  if (userId == null) return null;
  return readMicrosoftUserTokens(userId)?.email?.trim() || null;
}

export function getConnectedMicrosoftDisplayName(
  userId: number | null
): string | null {
  if (userId == null) return null;
  return readMicrosoftUserTokens(userId)?.displayName?.trim() || null;
}

export function getConnectedMicrosoftId(
  userId: number | null
): string | null {
  if (userId == null) return null;
  return readMicrosoftUserTokens(userId)?.microsoftId?.trim() || null;
}

export function resolveMicrosoftUserId(
  auth: Pick<AuthContext, "userId" | "username" | "isAdmin">
): number | null {
  return resolveAppUserId(auth);
}

export function beginMicrosoftOauth(
  userId: number,
  request?: Request | null
): string {
  const clientId = getMicrosoftOauthClientId();
  if (!clientId || !getMicrosoftOauthClientSecret()) {
    throw new Error(
      "Microsoft OAuth nicht konfiguriert (Client-ID und Secret in den Einstellungen)."
    );
  }
  const nonce = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  setSetting(
    stateSettingKey(userId),
    JSON.stringify({ nonce, at: new Date().toISOString() })
  );
  const state = Buffer.from(
    JSON.stringify({ u: userId, n: nonce, p: "connect" }),
    "utf8"
  ).toString("base64url");

  const url = new URL(authorizeEndpoint());
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getMicrosoftOauthRedirectUri(request));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  // Force account picker alone — Entra rejects combined values like
  // "select_account consent" (AADSTS90023).
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Sign-in (not «Konto verbinden»): no WorkBuddy session yet. */
export function beginMicrosoftOauthLogin(
  request?: Request | null,
  nextPath?: string | null
): string {
  const clientId = getMicrosoftOauthClientId();
  if (!clientId || !getMicrosoftOauthClientSecret()) {
    throw new Error(
      "Microsoft OAuth nicht konfiguriert (Client-ID und Secret)."
    );
  }
  const nonce = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  const next =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/";
  setSetting(
    loginStateSettingKey(nonce),
    JSON.stringify({ at: new Date().toISOString(), next })
  );
  const state = Buffer.from(
    JSON.stringify({ u: 0, n: nonce, p: "login" }),
    "utf8"
  ).toString("base64url");

  const url = new URL(authorizeEndpoint());
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getMicrosoftOauthRedirectUri(request));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function parseMicrosoftOauthState(
  stateRaw: string | null
): { userId: number; nonce: string; purpose: "login" | "connect" } | null {
  if (!stateRaw) return null;
  try {
    const json = Buffer.from(stateRaw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as {
      u?: number;
      n?: string;
      p?: string;
    };
    if (!parsed.n || typeof parsed.n !== "string") return null;
    const purpose = parsed.p === "login" ? "login" : "connect";
    const userId = Number(parsed.u);
    if (purpose === "login") {
      return { userId: 0, nonce: parsed.n, purpose };
    }
    if (!Number.isInteger(userId) || userId < 1) return null;
    return { userId, nonce: parsed.n, purpose };
  } catch {
    return null;
  }
}

export function consumeMicrosoftOauthLoginState(
  nonce: string
): { next: string } | null {
  const key = loginStateSettingKey(nonce);
  const raw = getSetting(key);
  setSetting(key, null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: string; next?: string };
    if (parsed.at) {
      const age = Date.now() - new Date(parsed.at).getTime();
      if (age > 15 * 60 * 1000) return null;
    }
    const next =
      parsed.next &&
      parsed.next.startsWith("/") &&
      !parsed.next.startsWith("//")
        ? parsed.next
        : "/";
    return { next };
  } catch {
    return null;
  }
}

export function consumeMicrosoftOauthState(
  userId: number,
  nonce: string
): boolean {
  const raw = getSetting(stateSettingKey(userId));
  setSetting(stateSettingKey(userId), null);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { nonce?: string; at?: string };
    if (parsed.nonce !== nonce) return false;
    if (parsed.at) {
      const age = Date.now() - new Date(parsed.at).getTime();
      if (age > 15 * 60 * 1000) return false;
    }
    return true;
  } catch {
    return false;
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function exchangeToken(
  body: Record<string, string>
): Promise<TokenResponse> {
  const clientId = getMicrosoftOauthClientId();
  const clientSecret = getMicrosoftOauthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth nicht konfiguriert.");
  }
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    ...body,
  });
  const res = await outboundFetch(
    tokenEndpoint(),
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    { label: "Microsoft-Anmeldung" }
  );
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Token-Austausch fehlgeschlagen (${res.status})`
    );
  }
  return json;
}

async function fetchGraphProfile(accessToken: string): Promise<{
  id: string | null;
  email: string | null;
  displayName: string | null;
}> {
  const res = await outboundFetch(
    "https://graph.microsoft.com/v1.0/me",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { label: "Microsoft Graph" }
  );
  if (!res.ok) return { id: null, email: null, displayName: null };
  const me = (await res.json()) as {
    id?: string | null;
    mail?: string | null;
    userPrincipalName?: string | null;
    displayName?: string | null;
  };
  return {
    id: me.id?.trim() || null,
    email: (me.mail || me.userPrincipalName || null)?.trim() || null,
    displayName: me.displayName?.trim() || null,
  };
}

export async function finishMicrosoftOauth(
  userId: number,
  code: string,
  request?: Request | null
): Promise<MicrosoftUserTokens> {
  const json = await exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: getMicrosoftOauthRedirectUri(request),
    scope: MICROSOFT_OAUTH_SCOPES.join(" "),
  });

  const existing = readMicrosoftUserTokens(userId);
  const refreshToken = json.refresh_token || existing?.refreshToken || "";
  if (!refreshToken) {
    throw new Error(
      "Kein Refresh-Token erhalten. In Entra «offline_access» prüfen und erneut verbinden (Consent)."
    );
  }
  if (!json.access_token) {
    throw new Error("Kein Access-Token erhalten.");
  }

  const profile = await fetchGraphProfile(json.access_token);
  const saved: MicrosoftUserTokens = {
    refreshToken,
    accessToken: json.access_token,
    expiryDate: Date.now() + (json.expires_in || 3600) * 1000,
    email: profile.email || existing?.email || null,
    displayName: profile.displayName || existing?.displayName || null,
    microsoftId: profile.id || existing?.microsoftId || null,
    scope: json.scope || MICROSOFT_OAUTH_SCOPES.join(" "),
    updatedAt: new Date().toISOString(),
  };
  saveMicrosoftUserTokens(userId, saved);
  try {
    const { syncMicrosoftProfilePhoto } = await import("@/lib/microsoft/photo");
    await syncMicrosoftProfilePhoto(userId);
  } catch {
    /* Photo optional — login still succeeds */
  }
  return saved;
}

/** Login: exchange code, require @an-group.one, provision an isolated user, store Graph tokens. */
export async function finishMicrosoftLogin(
  code: string,
  request?: Request | null
): Promise<{ user: AppUserRow; tokens: MicrosoftUserTokens }> {
  const json = await exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: getMicrosoftOauthRedirectUri(request),
    scope: MICROSOFT_OAUTH_SCOPES.join(" "),
  });
  if (!json.access_token) {
    throw new Error("Kein Access-Token erhalten.");
  }
  const profile = await fetchGraphProfile(json.access_token);
  if (!profile.email || !isAllowedCompanyEmail(profile.email)) {
    throw new Error(
      "Nur Mitarbeitende mit einer @an-group.one-Adresse dürfen sich anmelden."
    );
  }
  if (!json.refresh_token) {
    throw new Error(
      "Kein Refresh-Token erhalten. In Entra «offline_access» prüfen und erneut anmelden."
    );
  }
  const user = await findOrProvisionCompanyUser({
    email: profile.email,
    displayName: profile.displayName,
  });
  const tokens: MicrosoftUserTokens = {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiryDate: Date.now() + (json.expires_in || 3600) * 1000,
    email: profile.email,
    displayName: profile.displayName,
    microsoftId: profile.id,
    scope: json.scope || MICROSOFT_OAUTH_SCOPES.join(" "),
    updatedAt: new Date().toISOString(),
  };
  saveMicrosoftUserTokens(user.id, tokens);
  try {
    const { syncMicrosoftProfilePhoto } = await import("@/lib/microsoft/photo");
    await syncMicrosoftProfilePhoto(user.id);
  } catch {
    /* Photo optional — login still succeeds */
  }
  return { user, tokens };
}

/** Valid access token for Graph calls (refreshes when needed). */
export async function getMicrosoftAccessToken(
  userId: number,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const stored = readMicrosoftUserTokens(userId);
  if (!stored?.refreshToken) {
    throw new Error("Microsoft 365-Konto nicht verbunden.");
  }
  if (
    !options?.forceRefresh &&
    stored.accessToken &&
    stored.expiryDate != null &&
    stored.expiryDate > Date.now() + 60_000
  ) {
    return stored.accessToken;
  }

  const json = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    scope: MICROSOFT_OAUTH_SCOPES.join(" "),
  });
  if (!json.access_token) {
    throw new Error("Microsoft Access-Token-Refresh fehlgeschlagen.");
  }
  const next: MicrosoftUserTokens = {
    ...stored,
    accessToken: json.access_token,
    expiryDate: Date.now() + (json.expires_in || 3600) * 1000,
    refreshToken: json.refresh_token || stored.refreshToken,
    scope: json.scope || stored.scope,
    updatedAt: new Date().toISOString(),
  };
  saveMicrosoftUserTokens(userId, next);
  return json.access_token;
}

/**
 * Azure admin consent is not enough if the stored token predates the scopes.
 * Force a refresh (full MICROSOFT_OAUTH_SCOPES) so incremental grants can land.
 */
export async function ensureMicrosoftMeetingTranscriptScopes(
  userId: number
): Promise<{ hasMeetings: boolean; hasTranscript: boolean }> {
  if (
    hasMicrosoftOnlineMeetingsScope(userId) &&
    hasMicrosoftTranscriptScope(userId)
  ) {
    return { hasMeetings: true, hasTranscript: true };
  }
  try {
    await getMicrosoftAccessToken(userId, { forceRefresh: true });
  } catch {
    /* keep stored token — caller may ask the user to reconnect */
  }
  return {
    hasMeetings: hasMicrosoftOnlineMeetingsScope(userId),
    hasTranscript: hasMicrosoftTranscriptScope(userId),
  };
}
