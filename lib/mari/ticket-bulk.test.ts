import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTicketIdList,
  sanitizeBulkIssueIds,
  summarizeBulkResults,
  MAX_BULK_TICKET_IDS,
} from "./ticket-bulk.ts";
import { STATUS_LABELS, TICKET_EDIT_STATUS_IDS } from "./status.ts";

test("sanitizeBulkIssueIds keeps unique positive ints", () => {
  assert.deepEqual(sanitizeBulkIssueIds([144642, "144643", 144642, 0, -1]), [
    144642,
    144643,
  ]);
  assert.deepEqual(sanitizeBulkIssueIds("nope"), []);
});

test("sanitizeBulkIssueIds caps at MAX_BULK_TICKET_IDS", () => {
  const raw = Array.from({ length: MAX_BULK_TICKET_IDS + 10 }, (_, i) => i + 1);
  assert.equal(sanitizeBulkIssueIds(raw).length, MAX_BULK_TICKET_IDS);
});

test("formatTicketIdList joins and truncates", () => {
  assert.equal(formatTicketIdList([1, 2, 3]), "#1, #2, #3");
  assert.equal(
    formatTicketIdList([1, 2, 3, 4], 2),
    "#1, #2 und 2 weitere"
  );
});

test("summarizeBulkResults splits ok vs error", () => {
  const { succeeded, failed } = summarizeBulkResults([
    { issueId: 1, ok: true },
    { issueId: 2, ok: false, error: "nein" },
  ]);
  assert.deepEqual(succeeded, [1]);
  assert.deepEqual(failed, [{ issueId: 2, error: "nein" }]);
});

test("TICKET_EDIT_STATUS_IDS are labeled statuses", () => {
  for (const id of TICKET_EDIT_STATUS_IDS) {
    assert.ok(STATUS_LABELS[id], `missing label for ${id}`);
  }
});
