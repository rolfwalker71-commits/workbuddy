import assert from "node:assert/strict";
import test from "node:test";
import {
  MICROSOFT_OAUTH_CALLBACK_PATH,
  MICROSOFT_OAUTH_SCOPES,
  parseMicrosoftOauthState,
} from "./oauth.ts";

test("Microsoft scopes include mail + calendar + tasks + Teams read", () => {
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Mail.ReadWrite"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Calendars.ReadWrite"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Tasks.ReadWrite"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("offline_access"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Chat.Read"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("ChatMessage.Read"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("ChatMessage.Send"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Team.ReadBasic.All"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("Channel.ReadBasic.All"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("ChannelMessage.Read.All"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("OnlineMeetings.Read"));
  assert.ok(MICROSOFT_OAUTH_SCOPES.includes("OnlineMeetingTranscript.Read.All"));
  const authorizeScope = MICROSOFT_OAUTH_SCOPES.join(" ");
  assert.match(authorizeScope, /OnlineMeetings\.Read/);
  assert.match(authorizeScope, /OnlineMeetingTranscript\.Read\.All/);
  assert.ok(!(MICROSOFT_OAUTH_SCOPES as readonly string[]).includes("Chat.ReadWrite"));
  assert.ok(
    !(MICROSOFT_OAUTH_SCOPES as readonly string[]).includes("Team.ReadWrite.All")
  );
  assert.ok(
    !(MICROSOFT_OAUTH_SCOPES as readonly string[]).includes("Channel.Read.All")
  );
  assert.equal(
    MICROSOFT_OAUTH_CALLBACK_PATH,
    "/api/microsoft/oauth/callback"
  );
});

test("parseMicrosoftOauthState decodes base64url payload", () => {
  const state = Buffer.from(
    JSON.stringify({ u: 42, n: "abc.nonce" }),
    "utf8"
  ).toString("base64url");
  const parsed = parseMicrosoftOauthState(state);
  assert.deepEqual(parsed, {
    userId: 42,
    nonce: "abc.nonce",
    purpose: "connect",
  });
  const loginState = Buffer.from(
    JSON.stringify({ u: 0, n: "login.nonce", p: "login" }),
    "utf8"
  ).toString("base64url");
  assert.deepEqual(parseMicrosoftOauthState(loginState), {
    userId: 0,
    nonce: "login.nonce",
    purpose: "login",
  });
  assert.equal(parseMicrosoftOauthState(null), null);
  assert.equal(parseMicrosoftOauthState("not-valid"), null);
});
