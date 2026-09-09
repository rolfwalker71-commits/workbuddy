import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBatchHoursGuesses,
  batchHoursRowBlockers,
  batchHoursRowsForDay,
  batchHoursRowsNeedingGuess,
  isBatchHoursCandidate,
  type BatchHoursSourceEvent,
} from "./batch-hours-rows.ts";

function event(
  over: Partial<BatchHoursSourceEvent> = {}
): BatchHoursSourceEvent {
  return {
    id: "ev-1",
    provider: "microsoft",
    calendarId: "cal-1",
    title: "Besprechung",
    date: "2026-09-09",
    time: "09:00",
    endTime: "10:00",
    isAllDay: false,
    done: true,
    attendeeEmails: [],
    mari: null,
    ...over,
  };
}

test("isBatchHoursCandidate drops booked, foreign and ritual events", () => {
  assert.equal(isBatchHoursCandidate(event()), true);
  assert.equal(
    isBatchHoursCandidate(
      event({ mari: { issueId: 0, stampStatus: "booked", hours: 1, cardCode: null, briefDescription: null, status: null, statusName: null } })
    ),
    false
  );
  assert.equal(isBatchHoursCandidate(event({ provider: "google" })), false);
  assert.equal(
    isBatchHoursCandidate(event({ id: "buddy-day-close" })),
    false
  );
  // pending is still bookable
  assert.equal(
    isBatchHoursCandidate(
      event({ mari: { issueId: 0, stampStatus: "pending", hours: null, cardCode: null, briefDescription: null, status: null, statusName: null } })
    ),
    true
  );
});

test("rows preselect finished timed events only", () => {
  const rows = batchHoursRowsForDay([
    event({ id: "a", done: true }),
    event({ id: "b", done: false }),
    event({ id: "c", done: true, isAllDay: true, time: null, endTime: null }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.eventId, r.selected]),
    [
      ["a", true],
      ["b", false],
      ["c", false],
    ]
  );
});

test("rows are ordered by start time, all-day last", () => {
  const rows = batchHoursRowsForDay([
    event({ id: "late", time: "14:00", endTime: "15:00" }),
    event({ id: "allday", isAllDay: true, time: null, endTime: null }),
    event({ id: "early", time: "08:00", endTime: "08:30" }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.eventId),
    ["early", "late", "allday"]
  );
});

test("hours default to the event duration for both columns", () => {
  const [row] = batchHoursRowsForDay([
    event({ time: "08:00", endTime: "08:25" }),
  ]);
  assert.ok(row);
  assert.equal(row.defaults.hours, row.defaults.hoursBillable);
  assert.ok(row.defaults.hours > 0);
});

test("a stored booking prefills project and contract", () => {
  const [row] = batchHoursRowsForDay([
    event({
      mari: {
        issueId: 0,
        stampStatus: "pending",
        hours: null,
        cardCode: null,
        briefDescription: null,
        status: null,
        statusName: null,
        booking: {
          cardCode: "C123",
          customerName: "Birchmeier",
          projectNumber: "P600143",
          projectLabel: "P600143 Birchmeier",
          contractId: 42,
          contractVisible: "V60014303",
          source: "pinned",
          meetingKind: "external",
          contractOptional: false,
        },
      },
    }),
  ]);
  assert.ok(row);
  assert.equal(row.defaults.projectNumber, "P600143");
  assert.equal(row.defaults.contractId, 42);
  assert.equal(row.defaults.contractVisible, "V60014303");
  assert.deepEqual(batchHoursRowBlockers(row), []);
});

test("blockers name what is still missing", () => {
  const [row] = batchHoursRowsForDay([event({ title: "MorgenCall" })]);
  assert.ok(row);
  assert.ok(batchHoursRowBlockers(row).includes("project"));
});

test("only rows without a project ask the server for a guess", () => {
  const rows = batchHoursRowsForDay([
    event({ id: "plain", title: "MorgenCall" }),
    event({
      id: "mapped",
      mari: {
        issueId: 0,
        stampStatus: "pending",
        hours: null,
        cardCode: null,
        briefDescription: null,
        status: null,
        statusName: null,
        booking: {
          cardCode: null,
          customerName: null,
          projectNumber: "P600143",
          projectLabel: "P600143",
          contractId: 7,
          contractVisible: null,
          source: "pinned",
          meetingKind: "external",
          contractOptional: false,
        },
      },
    }),
  ]);
  assert.deepEqual(
    batchHoursRowsNeedingGuess(rows).map((r) => r.eventId),
    ["plain"]
  );
});

test("a guess fills an empty row and never overrides a mapped one", () => {
  const rows = batchHoursRowsForDay([
    event({ id: "plain", title: "Rinco: Server" }),
    event({
      id: "mapped",
      mari: {
        issueId: 0,
        stampStatus: "pending",
        hours: null,
        cardCode: null,
        briefDescription: null,
        status: null,
        statusName: null,
        booking: {
          cardCode: null,
          customerName: null,
          projectNumber: "P111111",
          projectLabel: "P111111",
          contractId: 7,
          contractVisible: null,
          source: "pinned",
          meetingKind: "external",
          contractOptional: false,
        },
      },
    }),
  ]);
  const guess = {
    cardCode: "C9",
    customerName: "Rinco",
    projectNumber: "P999999",
    projectLabel: "P999999 Rinco",
    contractId: 3,
    contractVisible: "V3",
    source: "recognized" as const,
    meetingKind: "external" as const,
    contractOptional: false,
  };
  const merged = applyBatchHoursGuesses(
    rows,
    new Map([
      ["plain", guess],
      ["mapped", guess],
    ])
  );
  const plain = merged.find((r) => r.eventId === "plain");
  const mapped = merged.find((r) => r.eventId === "mapped");
  assert.equal(plain?.defaults.projectNumber, "P999999");
  assert.equal(plain?.defaults.contractId, 3);
  assert.equal(mapped?.defaults.projectNumber, "P111111");
  assert.equal(mapped?.defaults.contractId, 7);
});
