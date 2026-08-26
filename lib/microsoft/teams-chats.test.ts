import assert from "node:assert/strict";
import test from "node:test";
import { asChatType, mapGraphChat } from "./teams-chats.ts";

test("asChatType maps meeting chats", () => {
  assert.equal(asChatType("meeting"), "meeting");
  assert.equal(asChatType("oneOnOne"), "oneOnOne");
  assert.equal(asChatType("group"), "group");
  assert.equal(asChatType("other"), "unknown");
});

test("mapGraphChat keeps joinUrl from onlineMeetingInfo", () => {
  const item = mapGraphChat(
    {
      id: "19:meeting_abc@thread.v2",
      topic: "Technische Abstimmung – Kurztermin",
      chatType: "meeting",
      webUrl: "https://teams.microsoft.com/l/chat/19:meeting_abc",
      onlineMeetingInfo: {
        joinWebUrl:
          "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0",
        calendarEventId: "AAMkEvent1",
      },
    },
    null
  );
  assert.ok(item);
  assert.equal(item?.chatType, "meeting");
  assert.equal(
    item?.joinUrl,
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0"
  );
  assert.equal(item?.calendarEventId, "AAMkEvent1");
  assert.equal(item?.title, "Technische Abstimmung – Kurztermin");
});

test("mapGraphChat without meeting info has no joinUrl", () => {
  const item = mapGraphChat(
    {
      id: "19:chat1",
      topic: "Allgemein",
      chatType: "group",
    },
    null
  );
  assert.ok(item);
  assert.equal(item?.joinUrl, null);
  assert.equal(item?.calendarEventId, null);
  assert.equal(item?.chatType, "group");
});
