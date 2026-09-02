import assert from "node:assert/strict";
import test from "node:test";
import {
  compareMariTicketsByListSort,
  isMariListSort,
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

test("isMariListSort accepts status", () => {
  assert.equal(isMariListSort("newest"), true);
  assert.equal(isMariListSort("oldest"), true);
  assert.equal(isMariListSort("status"), true);
  assert.equal(isMariListSort("priority"), false);
});

test("parseMariTicketFilterPrefsPatch keeps listSort status", () => {
  assert.equal(
    parseMariTicketFilterPrefsPatch({ listSort: "status" })?.listSort,
    "status"
  );
});

test("compareMariTicketsByListSort orders by workflow status then newest", () => {
  const neu = { issueId: 10, status: 11, requestDate: "2026-08-01" };
  const offenOld = { issueId: 11, status: 1, requestDate: "2026-07-01" };
  const offenNew = { issueId: 12, status: 1, requestDate: "2026-09-01" };
  const geloest = { issueId: 13, status: 2, requestDate: "2026-09-02" };
  const rows = [geloest, offenOld, neu, offenNew];
  rows.sort((a, b) => compareMariTicketsByListSort(a, b, "status"));
  assert.deepEqual(
    rows.map((r) => r.issueId),
    [10, 12, 11, 13]
  );
});

test("parseMariTicketFilterPrefsPatch keeps ttv lookback days", () => {
  const patch = parseMariTicketFilterPrefsPatch({ ttvLookbackDays: 4 });
  assert.equal(patch?.ttvLookbackDays, 4);
  assert.equal(
    parseMariTicketFilterPrefsPatch({ ttvLookbackDays: 99 })?.ttvLookbackDays,
    undefined
  );
});
