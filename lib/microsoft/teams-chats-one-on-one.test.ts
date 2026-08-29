import assert from "node:assert/strict";
import test from "node:test";
import { MicrosoftGraphError } from "./graph.ts";
import {
  isSelfOnlyChat,
  oneOnOneChatMatchesPeer,
  targetIsSelfPeer,
  teamsChatUserMessage,
} from "./teams-chats.ts";

test("oneOnOneChatMatchesPeer matches AAD id or email, ignores self", () => {
  const members = [
    { userId: "me-aad", email: "me@an-group.one", displayName: "Ich" },
    { userId: "other-aad", email: "anna@an-group.one", displayName: "Anna" },
  ];
  assert.equal(
    oneOnOneChatMatchesPeer(members, "me-aad", { microsoftId: "other-aad" }),
    true
  );
  assert.equal(
    oneOnOneChatMatchesPeer(members, "me-aad", {
      email: "Anna@an-group.one",
    }),
    true
  );
  assert.equal(
    oneOnOneChatMatchesPeer(members, "me-aad", { microsoftId: "me-aad" }),
    false
  );
  assert.equal(
    oneOnOneChatMatchesPeer(members, "me-aad", { email: "nobody@x.ch" }),
    false
  );
});

test("isSelfOnlyChat is true only when every member is the current user", () => {
  assert.equal(
    isSelfOnlyChat(
      [{ userId: "me-aad", email: "me@an-group.one", displayName: "Ich" }],
      "me-aad"
    ),
    true
  );
  assert.equal(
    isSelfOnlyChat(
      [
        { userId: "me-aad", email: "me@an-group.one" },
        { userId: "me-aad", email: "me@an-group.one" },
      ],
      "me-aad"
    ),
    true
  );
  assert.equal(
    isSelfOnlyChat(
      [
        { userId: "me-aad" },
        { userId: "other-aad", email: "anna@an-group.one" },
      ],
      "me-aad"
    ),
    false
  );
  assert.equal(isSelfOnlyChat([], "me-aad"), false);
});

test("targetIsSelfPeer matches own AAD id or mail", () => {
  const me = {
    id: "me-aad",
    mail: "me@an-group.one",
    userPrincipalName: "me@an-group.one",
  };
  assert.equal(targetIsSelfPeer(me, { microsoftId: "me-aad" }), true);
  assert.equal(targetIsSelfPeer(me, { email: "Me@an-group.one" }), true);
  assert.equal(targetIsSelfPeer(me, { microsoftId: "other-aad" }), false);
});

test("teamsChatUserMessage maps Graph 405/403 without raw JSON", () => {
  const raw405 = new MicrosoftGraphError(
    405,
    '{"error":{"code":"UnknownError","message":""}}'
  );
  const mapped = teamsChatUserMessage(raw405, "Chat.Create");
  assert.match(mapped || "", /Teams erlaubt diese Chat-Aktion nicht/);
  assert.doesNotMatch(mapped || "", /UnknownError/);
  assert.equal(
    teamsChatUserMessage(
      new MicrosoftGraphError(403, "{}"),
      "Chat.Create"
    ),
    "Chat.Create fehlt. Unter Konto Microsoft 365 neu verbinden."
  );
  assert.equal(teamsChatUserMessage(new Error("other"), "Chat.Create"), null);
});
