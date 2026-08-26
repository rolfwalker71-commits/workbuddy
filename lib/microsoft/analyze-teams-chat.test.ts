import assert from "node:assert/strict";
import test from "node:test";
import {
  chatsActiveOnZurichDay,
  emptyTeamsAnalysis,
  filterMessagesForZurichDay,
  packTeamsThread,
  sanitizeTeamsAnalysis,
} from "./analyze-teams-chat.ts";

test("chatsActiveOnZurichDay keeps only Zurich-calendar matches", () => {
  const day = "2026-08-26";
  const out = chatsActiveOnZurichDay(
    [
      { id: "a", lastUpdatedAt: "2026-08-26T07:15:00.000Z" },
      { id: "b", lastUpdatedAt: "2026-08-25T10:00:00.000Z" },
      { id: "c", lastUpdatedAt: null },
    ],
    day
  );
  assert.deepEqual(
    out.map((c) => c.id),
    ["a"]
  );
});

test("filterMessagesForZurichDay drops other days", () => {
  const out = filterMessagesForZurichDay(
    [
      { from: "Anna", text: "heute", createdAt: "2026-08-26T08:00:00.000Z" },
      { from: "Rolf", text: "gestern", createdAt: "2026-08-25T10:00:00.000Z" },
    ],
    "2026-08-26"
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.text, "heute");
});

test("packTeamsThread includes speaker and trims", () => {
  const packed = packTeamsThread({
    id: "c1",
    title: "Anna",
    messages: [
      {
        from: "Anna",
        text: "Kannst du die Offerte schicken?",
        createdAt: "2026-08-26T08:00:00.000Z",
      },
    ],
  });
  assert.match(packed, /Anna:/);
  assert.match(packed, /Offerte/);
});

test("sanitizeTeamsAnalysis drops empty events and attaches source chat", () => {
  const analysis = sanitizeTeamsAnalysis(
    {
      summary: "Offerte offen",
      clusters: [
        {
          sourceChatId: "c1",
          sourceChatTitle: "Anna",
          summary: "Anna wartet auf die Offerte.",
          tasks: [{ title: "Offerte schicken", reason: "Bitte im Chat" }],
          events: [{ title: "Ohne Datum" }],
          replies: [{ to: "Anna", body: "Schicke ich heute." }],
        },
      ],
    },
    [{ id: "c1", title: "Anna", messages: [] }]
  );
  assert.equal(analysis.tasks.length, 1);
  assert.equal(analysis.tasks[0]?.sourceChatTitle, "Anna");
  assert.equal(analysis.events.length, 0);
  assert.equal(analysis.replies.length, 1);
  assert.match(analysis.summary, /Offerte/);
});

test("emptyTeamsAnalysis has no suggestions", () => {
  const empty = emptyTeamsAnalysis("Keine Nachrichten zum Analysieren.");
  assert.equal(empty.tasks.length, 0);
  assert.equal(empty.events.length, 0);
  assert.equal(empty.replies.length, 0);
});
