import assert from "node:assert/strict";
import test from "node:test";
import {
  isMariTicketFilterMode,
  parseMariTicketFilterPrefsPatch,
} from "./ticket-filter-prefs-shared.ts";

test("isMariTicketFilterMode accepts ttv", () => {
  assert.equal(isMariTicketFilterMode("ttv"), true);
  assert.equal(isMariTicketFilterMode("handler"), true);
  assert.equal(isMariTicketFilterMode("other"), false);
});

test("parseMariTicketFilterPrefsPatch keeps ttv mode", () => {
  const patch = parseMariTicketFilterPrefsPatch({ filterMode: "ttv" });
  assert.equal(patch?.filterMode, "ttv");
});
