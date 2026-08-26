import assert from "node:assert/strict";
import test from "node:test";
import {
  asChannelMembership,
  mapGraphChannel,
  mapGraphChannelMessage,
  mapGraphTeam,
} from "./teams-channels.ts";

test("mapGraphTeam requires id and displayName", () => {
  assert.equal(mapGraphTeam({}), null);
  assert.equal(mapGraphTeam({ id: "t1" }), null);
  assert.deepEqual(mapGraphTeam({ id: " t1 ", displayName: " Support " }), {
    id: "t1",
    name: "Support",
    description: null,
  });
});

test("mapGraphChannel keeps team context and membership", () => {
  assert.equal(
    mapGraphChannel({ displayName: "Allgemein" }, { id: "t1", name: "Support" }),
    null
  );
  assert.deepEqual(
    mapGraphChannel(
      {
        id: "19:ch1",
        displayName: " Allgemein ",
        description: "News",
        webUrl: "https://teams.microsoft.com/l/channel/1",
        membershipType: "private",
      },
      { id: "t1", name: "Support" }
    ),
    {
      id: "19:ch1",
      teamId: "t1",
      teamName: "Support",
      name: "Allgemein",
      description: "News",
      webUrl: "https://teams.microsoft.com/l/channel/1",
      membershipType: "private",
    }
  );
  assert.equal(asChannelMembership("standard"), "standard");
  assert.equal(asChannelMembership("weird"), "unknown");
});

test("mapGraphChannelMessage skips system and empty bodies", () => {
  assert.equal(
    mapGraphChannelMessage({
      id: "m1",
      messageType: "systemEventMessage",
      body: { content: "<p>joined</p>" },
    }),
    null
  );
  assert.equal(
    mapGraphChannelMessage({
      id: "m2",
      messageType: "message",
      body: { content: "<p></p>" },
    }),
    null
  );
  assert.deepEqual(
    mapGraphChannelMessage({
      id: "m3",
      createdDateTime: "2026-08-26T08:00:00Z",
      messageType: "message",
      from: { user: { displayName: "Rolf" } },
      body: { content: "<p>Bitte <b>prüfen</b></p>" },
    }),
    {
      id: "m3",
      createdAt: "2026-08-26T08:00:00Z",
      from: "Rolf",
      text: "Bitte prüfen",
    }
  );
});
