import assert from "node:assert/strict";
import test from "node:test";
import { MicrosoftGraphError } from "./graph.ts";
import {
  cachedSelfChatId,
  chatLooksLikeSelfChat,
  chatWalkPageLimit,
  clearSelfChatIdCache,
  graphErrorCode,
  isSelfOnlyChat,
  oneOnOneChatMatchesPeer,
  rememberSelfChatId,
  selfChatTopicMatch,
  shouldContinueChatWalk,
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
  assert.equal(
    isSelfOnlyChat([{ displayName: "Ich" }], "me-aad"),
    true
  );
  assert.equal(
    isSelfOnlyChat(
      [{ email: "me@an-group.one", displayName: "Ich" }],
      "other-id",
      ["me@an-group.one"]
    ),
    true
  );
});

test("selfChatTopicMatch accepts Selbst / yourself topics", () => {
  assert.equal(selfChatTopicMatch("Chat mit dir selbst"), true);
  assert.equal(selfChatTopicMatch("Chat mit mir"), true);
  assert.equal(selfChatTopicMatch("Chat with yourself"), true);
  assert.equal(selfChatTopicMatch("Notes"), true);
  assert.equal(selfChatTopicMatch("Technische Abstimmung"), false);
});

test("chatLooksLikeSelfChat finds one-member, topic, or me-only chats", () => {
  assert.equal(
    chatLooksLikeSelfChat(
      {
        chatType: "oneOnOne",
        topic: "Chat mit dir selbst",
        members: [],
      },
      "me-aad"
    ),
    true
  );
  assert.equal(
    chatLooksLikeSelfChat(
      {
        chatType: "oneOnOne",
        topic: null,
        members: [{ displayName: "Rolf" }],
      },
      "me-aad"
    ),
    true
  );
  assert.equal(
    chatLooksLikeSelfChat(
      {
        chatType: "oneOnOne",
        topic: "Chat with yourself",
        members: [
          { userId: "me-aad", email: "me@an-group.one" },
          { userId: "other-aad", email: "anna@an-group.one" },
        ],
      },
      "me-aad"
    ),
    false
  );
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

test("shouldContinueChatWalk stops at the page cap and deadline", () => {
  assert.equal(chatWalkPageLimit({ maxPages: 2 }), 2);
  assert.equal(chatWalkPageLimit({ maxPages: 99 }), 20);
  assert.equal(
    shouldContinueChatWalk("https://graph.microsoft.com/v1.0/me/chats?$skiptoken=x", 1, {
      maxPages: 2,
    }),
    "https://graph.microsoft.com/v1.0/me/chats?$skiptoken=x"
  );
  assert.equal(
    shouldContinueChatWalk("https://graph.microsoft.com/v1.0/me/chats?$skiptoken=x", 2, {
      maxPages: 2,
    }),
    null
  );
  assert.equal(
    shouldContinueChatWalk("https://graph.microsoft.com/v1.0/me/chats?$skiptoken=x", 1, {
      maxPages: 20,
      deadlineMs: 10,
      startedAt: Date.now() - 50,
    }),
    null
  );
});

test("self-chat id cache avoids a mailbox crawl on repeat lookups", () => {
  clearSelfChatIdCache();
  assert.equal(cachedSelfChatId(9), null);
  rememberSelfChatId(9, "19:self@thread.v2");
  assert.equal(cachedSelfChatId(9), "19:self@thread.v2");
  clearSelfChatIdCache(9);
  assert.equal(cachedSelfChatId(9), null);
});

test("teamsChatUserMessage includes Graph status and code on 400", () => {
  const err = new MicrosoftGraphError(
    400,
    '{"error":{"code":"BadRequest","message":"One member"}}'
  );
  assert.equal(graphErrorCode(err.body), "BadRequest");
  assert.match(
    teamsChatUserMessage(err, "Chat.Create") || "",
    /Chat nicht angelegt \(400 BadRequest\)/
  );
});
