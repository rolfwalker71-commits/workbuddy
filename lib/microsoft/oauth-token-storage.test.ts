import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * The hard requirement for encrypting the refresh tokens at rest: nobody may be
 * forced to sign in again or reconnect Microsoft 365. So the reader has to keep
 * accepting the plain JSON that earlier versions wrote.
 */
async function loadOauth(opts?: { withKey?: boolean }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-oauth-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  process.env.WORKBUDDY_SESSION_SECRET = "";
  if (opts?.withKey === false) {
    process.env.DATA_ENCRYPTION_KEY = "";
  } else {
    process.env.DATA_ENCRYPTION_KEY = "k".repeat(48);
  }
  const suffix = `?case=${Math.random()}`;
  const oauth = (await import(`./oauth.ts${suffix}`)) as typeof import("./oauth.ts");
  const migrations = (await import(
    `../db/migrations.ts${suffix}`
  )) as typeof import("../db/migrations.ts");
  return { oauth, migrations };
}

const TOKENS = {
  refreshToken: "0.AXoA-refresh-token-value",
  accessToken: "eyJ0eXAiOiJKV1Qi",
  expiresAt: "2026-09-10T12:00:00.000Z",
  scope: "Mail.Read Calendars.ReadWrite",
  account: "rolf.walker@an-group.one",
  updatedAt: "2026-09-10T11:00:00.000Z",
};

test("a saved token round-trips and is not stored in the clear", async () => {
  const { oauth, migrations } = await loadOauth();
  oauth.saveMicrosoftUserTokens(5, TOKENS);

  const back = oauth.readMicrosoftUserTokens(5);
  assert.equal(back?.refreshToken, TOKENS.refreshToken);
  assert.equal(back?.account, TOKENS.account);

  const stored = migrations.getSetting("microsoft_oauth_tokens_u5") || "";
  assert.ok(stored.startsWith("wb1:"), "expected an encrypted blob");
  assert.ok(
    !stored.includes(TOKENS.refreshToken),
    "refresh token must not appear in the stored value"
  );
});

test("plain JSON written by an older version stays readable", async () => {
  const { oauth, migrations } = await loadOauth();
  // Exactly what shipped before: JSON.stringify straight into settings.
  migrations.setSetting("microsoft_oauth_tokens_u7", JSON.stringify(TOKENS));

  const back = oauth.readMicrosoftUserTokens(7);
  assert.equal(back?.refreshToken, TOKENS.refreshToken);
  assert.equal(back?.scope, TOKENS.scope);
});

test("saving without a configured key keeps the token rather than losing it", async () => {
  const { oauth } = await loadOauth({ withKey: false });
  oauth.saveMicrosoftUserTokens(9, TOKENS);
  // Encrypting would throw here; the token must survive regardless.
  assert.equal(oauth.readMicrosoftUserTokens(9)?.refreshToken, TOKENS.refreshToken);
});

test("clearing removes the row", async () => {
  const { oauth, migrations } = await loadOauth();
  oauth.saveMicrosoftUserTokens(5, TOKENS);
  oauth.saveMicrosoftUserTokens(5, null);
  assert.equal(oauth.readMicrosoftUserTokens(5), null);
  assert.equal(migrations.getSetting("microsoft_oauth_tokens_u5"), null);
});

test("a token encrypted under a different key reads as absent, not as garbage", async () => {
  const { oauth, migrations } = await loadOauth();
  oauth.saveMicrosoftUserTokens(5, TOKENS);
  const blob = migrations.getSetting("microsoft_oauth_tokens_u5")!;

  const other = await loadOauth();
  process.env.DATA_ENCRYPTION_KEY = "x".repeat(48);
  other.migrations.setSetting("microsoft_oauth_tokens_u5", blob);
  // Reconnecting fixes this; returning half-parsed junk would not.
  assert.equal(other.oauth.readMicrosoftUserTokens(5), null);
});

test("a stored value that is neither a blob nor JSON reads as absent", async () => {
  const { oauth, migrations } = await loadOauth();
  migrations.setSetting("microsoft_oauth_tokens_u5", "not json at all");
  assert.equal(oauth.readMicrosoftUserTokens(5), null);
});

test("JSON without a refresh token counts as not connected", async () => {
  const { oauth, migrations } = await loadOauth();
  migrations.setSetting(
    "microsoft_oauth_tokens_u5",
    JSON.stringify({ ...TOKENS, refreshToken: "" })
  );
  assert.equal(oauth.readMicrosoftUserTokens(5), null);
});
