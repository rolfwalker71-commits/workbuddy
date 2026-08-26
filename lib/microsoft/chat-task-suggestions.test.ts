import assert from "node:assert/strict";
import test from "node:test";
import { heuristicChatTaskSuggestions } from "./chat-task-suggestions.ts";

test("heuristicChatTaskSuggestions keeps open questions and commitments", () => {
  const out = heuristicChatTaskSuggestions([
    { from: "Anna", text: "Kannst du die Offerte noch heute schicken?" },
    { from: "Rolf", text: "Ich schicke die PDF nach dem Call." },
    { from: "Anna", text: "Danke!" },
    { from: "Rolf", text: "ok" },
    { from: "Anna", text: "We need to follow up on the license." },
  ]);
  assert.ok(out.length >= 2);
  assert.ok(out.some((s) => /Offerte/i.test(s.title)));
  assert.ok(out.some((s) => /schicke|PDF/i.test(s.title)));
  assert.ok(out.every((s) => s.source === "heuristic"));
  assert.ok(!out.some((s) => /^danke/i.test(s.title)));
});

test("heuristicChatTaskSuggestions ignores empty and tiny noise", () => {
  assert.deepEqual(
    heuristicChatTaskSuggestions([
      { from: "A", text: "👍" },
      { from: "B", text: "ja" },
    ]),
    []
  );
});
