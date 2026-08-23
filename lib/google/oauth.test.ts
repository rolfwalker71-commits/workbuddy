import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Google scopes match M365 parity without Drive/Contacts", async () => {
  const { GOOGLE_OAUTH_CALLBACK_PATH, GOOGLE_OAUTH_SCOPES } = await import(
    "./oauth.ts"
  );
  assert.ok(
    GOOGLE_OAUTH_SCOPES.includes(
      "https://www.googleapis.com/auth/gmail.modify"
    )
  );
  assert.ok(
    GOOGLE_OAUTH_SCOPES.includes(
      "https://www.googleapis.com/auth/calendar.readonly"
    )
  );
  assert.ok(
    GOOGLE_OAUTH_SCOPES.includes(
      "https://www.googleapis.com/auth/calendar.events"
    )
  );
  assert.ok(
    GOOGLE_OAUTH_SCOPES.includes("https://www.googleapis.com/auth/tasks")
  );
  assert.ok(
    GOOGLE_OAUTH_SCOPES.includes(
      "https://www.googleapis.com/auth/userinfo.email"
    )
  );
  assert.ok(
    !(GOOGLE_OAUTH_SCOPES as readonly string[]).some((s) =>
      s.includes("drive")
    )
  );
  assert.ok(
    !(GOOGLE_OAUTH_SCOPES as readonly string[]).some((s) =>
      s.includes("contacts")
    )
  );
  assert.equal(GOOGLE_OAUTH_CALLBACK_PATH, "/api/google/oauth/callback");
});

test("parseOauthState decodes base64url payload", async () => {
  const { parseOauthState } = await import("./oauth.ts");
  const state = Buffer.from(
    JSON.stringify({ u: 42, n: "abc.nonce" }),
    "utf8"
  ).toString("base64url");
  assert.deepEqual(parseOauthState(state), { userId: 42, nonce: "abc.nonce" });
  assert.equal(parseOauthState(null), null);
  assert.equal(parseOauthState("not-valid"), null);
});

test("Google OAuth client is per-user and ignores env", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "env-shared-client.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "env-shared-secret";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-g-oauth-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser } = await import("../users/queries.ts");
  const {
    createOAuth2Client,
    getGoogleOauthClientCredentials,
    isGoogleOauthConfigured,
    parseOauthState,
  } = await import("./oauth.ts");

  const anna = createAppUser({
    username: "anna",
    email: "anna@example.com",
    displayName: "Anna",
    passwordHash: "hash",
  });
  const bernd = createAppUser({
    username: "bernd",
    email: "bernd@example.com",
    displayName: "Bernd",
    passwordHash: "hash",
  });

  assert.equal(isGoogleOauthConfigured(anna.id), false);
  assert.equal(getGoogleOauthClientCredentials(anna.id), null);

  updateAppUser(anna.id, {
    googleOauthClientId: "anna-client.apps.googleusercontent.com",
    googleOauthClientSecret: "anna-secret",
  });
  updateAppUser(bernd.id, {
    googleOauthClientId: "bernd-client.apps.googleusercontent.com",
    googleOauthClientSecret: "bernd-secret",
  });

  const annaCreds = getGoogleOauthClientCredentials(anna.id);
  const berndCreds = getGoogleOauthClientCredentials(bernd.id);
  assert.equal(annaCreds?.clientId, "anna-client.apps.googleusercontent.com");
  assert.equal(annaCreds?.clientSecret, "anna-secret");
  assert.equal(berndCreds?.clientId, "bernd-client.apps.googleusercontent.com");
  assert.equal(berndCreds?.clientSecret, "bernd-secret");
  assert.notEqual(annaCreds?.clientId, process.env.GOOGLE_OAUTH_CLIENT_ID);
  assert.notEqual(berndCreds?.clientId, process.env.GOOGLE_OAUTH_CLIENT_ID);

  const annaClient = createOAuth2Client(anna.id);
  const berndClient = createOAuth2Client(bernd.id);
  const clientIdOf = (c: { _clientId?: string }) => c._clientId;
  assert.equal(
    clientIdOf(annaClient),
    "anna-client.apps.googleusercontent.com"
  );
  assert.equal(
    clientIdOf(berndClient),
    "bernd-client.apps.googleusercontent.com"
  );
});

test("callback state binds that user's OAuth client", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "env-must-not-win.apps.googleusercontent.com";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-g-cb-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser } = await import("../users/queries.ts");
  const {
    createOAuth2Client,
    getGoogleOauthClientCredentials,
    parseOauthState,
  } = await import("./oauth.ts");

  const owner = createAppUser({
    username: "owner",
    email: "owner@example.com",
    displayName: "Owner",
    passwordHash: "hash",
  });
  const other = createAppUser({
    username: "other",
    email: "other@example.com",
    displayName: "Other",
    passwordHash: "hash",
  });
  updateAppUser(owner.id, {
    googleOauthClientId: "owner-client.apps.googleusercontent.com",
    googleOauthClientSecret: "owner-secret",
  });
  updateAppUser(other.id, {
    googleOauthClientId: "other-client.apps.googleusercontent.com",
    googleOauthClientSecret: "other-secret",
  });

  const state = Buffer.from(
    JSON.stringify({ u: owner.id, n: "cb.nonce" }),
    "utf8"
  ).toString("base64url");
  const parsed = parseOauthState(state);
  assert.ok(parsed);
  assert.equal(parsed.userId, owner.id);

  const creds = getGoogleOauthClientCredentials(parsed.userId);
  assert.equal(creds?.clientId, "owner-client.apps.googleusercontent.com");
  assert.notEqual(creds?.clientId, "other-client.apps.googleusercontent.com");
  assert.notEqual(creds?.clientId, process.env.GOOGLE_OAUTH_CLIENT_ID);

  const client = createOAuth2Client(parsed.userId);
  assert.equal(
    (client as { _clientId?: string })._clientId,
    "owner-client.apps.googleusercontent.com"
  );
});
