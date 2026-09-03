import assert from "node:assert/strict";
import test from "node:test";
import {
  diffTicketSinceSeen,
  parseTicketSeenMap,
  ticketSeenSnapshot,
} from "./ticket-list-change.ts";

const base = {
  issueId: 144078,
  status: 1,
  dueDate: "2026-09-10",
  changeAtDate: "2026-09-03T10:00:00",
};

test("diffTicketSinceSeen is null without a snapshot", () => {
  assert.equal(diffTicketSinceSeen(base, null), null);
  assert.equal(diffTicketSinceSeen(base, undefined), null);
});

test("diffTicketSinceSeen reports status and due together", () => {
  const seen = ticketSeenSnapshot(base);
  const change = diffTicketSinceSeen(
    { ...base, status: 3, dueDate: "2026-09-12T00:00:00" },
    seen
  );
  assert.deepEqual(change?.kinds, ["status", "due"]);
  assert.equal(change?.fromStatus, 1);
  assert.equal(change?.toStatus, 3);
  assert.equal(change?.fromDue, "2026-09-10");
  assert.equal(change?.toDue, "2026-09-12");
});

test("diffTicketSinceSeen ignores time-of-day on due dates", () => {
  const seen = ticketSeenSnapshot(base);
  assert.equal(
    diffTicketSinceSeen({ ...base, dueDate: "2026-09-10T18:30:00" }, seen),
    null
  );
});

test("diffTicketSinceSeen uses update only when status and due stay", () => {
  const seen = ticketSeenSnapshot(base);
  const change = diffTicketSinceSeen(
    { ...base, changeAtDate: "2026-09-03T12:00:00" },
    seen
  );
  assert.deepEqual(change?.kinds, ["update"]);
});

test("diffTicketSinceSeen skips update when status already changed", () => {
  const seen = ticketSeenSnapshot(base);
  const change = diffTicketSinceSeen(
    { ...base, status: 6, changeAtDate: "2026-09-03T12:00:00" },
    seen
  );
  assert.deepEqual(change?.kinds, ["status"]);
});

test("parseTicketSeenMap keeps valid rows and drops junk", () => {
  const map = parseTicketSeenMap({
    "144078": {
      issueId: 144078,
      status: 3,
      dueDate: "2026-09-10T11:00:00",
      changeAtDate: "2026-09-03T10:00:00",
    },
    bad: { issueId: "x" },
    "0": { issueId: 0, status: 1 },
  });
  assert.deepEqual(map["144078"], {
    issueId: 144078,
    status: 3,
    dueDate: "2026-09-10",
    changeAtDate: "2026-09-03T10:00:00",
  });
  assert.equal(map.bad, undefined);
  assert.equal(map["0"], undefined);
});
