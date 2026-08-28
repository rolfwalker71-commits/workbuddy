import assert from "node:assert/strict";
import test from "node:test";
import { parseTeamsReplyTarget } from "./teams-send.ts";
import { parseChannelThreadKey } from "./teams-thread-state.ts";

test("parseChannelThreadKey splits team:channel and rejects chat ids", () => {
  assert.deepEqual(
    parseChannelThreadKey("guid-team:19:abc@thread.tacv2"),
    { teamId: "guid-team", channelId: "19:abc@thread.tacv2" }
  );
  assert.equal(parseChannelThreadKey("19:abc@thread.v2"), null);
  assert.equal(parseChannelThreadKey(""), null);
});

test("parseTeamsReplyTarget prefers explicit chat or channel pair", () => {
  assert.deepEqual(
    parseTeamsReplyTarget({ chatId: "19:chat@thread.v2" }),
    { kind: "chat", chatId: "19:chat@thread.v2" }
  );
  assert.deepEqual(
    parseTeamsReplyTarget({
      teamId: "team-1",
      channelId: "19:ch@thread.tacv2",
    }),
    { kind: "channel", teamId: "team-1", channelId: "19:ch@thread.tacv2" }
  );
  assert.equal(
    parseTeamsReplyTarget({ teamId: "team-1" }),
    null
  );
});

test("parseTeamsReplyTarget reads threadKey as chat or channel", () => {
  assert.deepEqual(
    parseTeamsReplyTarget({ threadKey: "19:meeting_abc@thread.v2" }),
    { kind: "chat", chatId: "19:meeting_abc@thread.v2" }
  );
  assert.deepEqual(
    parseTeamsReplyTarget({
      threadKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:19:ch@thread.tacv2",
    }),
    {
      kind: "channel",
      teamId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      channelId: "19:ch@thread.tacv2",
    }
  );
  assert.equal(parseTeamsReplyTarget({}), null);
});
