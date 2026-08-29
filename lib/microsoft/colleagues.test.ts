import assert from "node:assert/strict";
import test from "node:test";
import {
  colleagueKey,
  mergeTicketPingColleagues,
  TICKET_PING_LIST_TIMEOUT_MS,
  TICKET_PING_PEER_MAX_PAGES,
  TICKET_PING_PEER_TIMEOUT_MS,
  type TicketPingColleague,
} from "./colleagues.ts";

function row(
  partial: Partial<TicketPingColleague> & Pick<TicketPingColleague, "key" | "source">
): TicketPingColleague {
  return {
    userId: null,
    displayName: "Kollege",
    email: null,
    microsoftId: null,
    chatId: null,
    ...partial,
  };
}

test("colleague list caps Graph enrichment so the picker cannot crawl all chats", () => {
  assert.equal(TICKET_PING_PEER_MAX_PAGES, 2);
  assert.ok(TICKET_PING_PEER_TIMEOUT_MS <= 8000);
  assert.ok(TICKET_PING_LIST_TIMEOUT_MS <= 15000);
  assert.ok(TICKET_PING_LIST_TIMEOUT_MS >= TICKET_PING_PEER_TIMEOUT_MS);
});

test("colleagueKey prefers WorkBuddy user id, then AAD, then email", () => {
  assert.equal(colleagueKey({ userId: 7, microsoftId: "aad", email: "a@x" }), "u:7");
  assert.equal(colleagueKey({ microsoftId: "AaD-1" }), "aad:aad-1");
  assert.equal(colleagueKey({ email: "Rolf@An-Group.one" }), "mail:rolf@an-group.one");
  assert.equal(colleagueKey({}), "");
});

test("mergeTicketPingColleagues shows Ich and WorkBuddy without chat peers", () => {
  const self = row({
    key: "u:1",
    source: "self",
    userId: 1,
    displayName: "Ich (Test)",
    email: "rolf@an-group.one",
    microsoftId: "me-aad",
  });
  const anna = row({
    key: "u:2",
    source: "workbuddy",
    userId: 2,
    displayName: "Anna",
    email: "anna@an-group.one",
    microsoftId: "anna-aad",
  });
  const merged = mergeTicketPingColleagues(self, [anna]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.displayName, "Ich (Test)");
  assert.equal(merged[1]?.displayName, "Anna");
  assert.equal(merged.every((c) => c.source !== "chat"), true);
});

test("mergeTicketPingColleagues appends chat peers and skips duplicates", () => {
  const anna = row({
    key: "u:2",
    source: "workbuddy",
    userId: 2,
    displayName: "Anna",
    email: "anna@an-group.one",
    microsoftId: "anna-aad",
  });
  const peerAnna = row({
    key: "aad:anna-aad",
    source: "chat",
    displayName: "Anna Chat",
    email: "anna@an-group.one",
    microsoftId: "anna-aad",
    chatId: "19:dup",
  });
  const peerBen = row({
    key: "aad:ben-aad",
    source: "chat",
    displayName: "Ben",
    email: "ben@an-group.one",
    microsoftId: "ben-aad",
    chatId: "19:ben",
  });
  const merged = mergeTicketPingColleagues(null, [anna], [peerAnna, peerBen]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.displayName, "Anna");
  assert.equal(merged[1]?.displayName, "Ben");
  assert.equal(merged[1]?.chatId, "19:ben");
});
