import assert from "node:assert/strict";
import test from "node:test";
import { oneOnOneChatMatchesPeer } from "./teams-chats.ts";

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
