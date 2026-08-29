import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSwissDate,
  formatSwissDateRange,
  formatSwissDateTime,
  toSwissDate,
  toSwissWeekday,
} from "./dates.ts";

test("formatSwissDate turns YYYY-MM-DD into dd.mm.yyyy", () => {
  assert.equal(formatSwissDate("2026-08-24"), "24.08.2026");
  assert.equal(toSwissDate("2026-08-24"), "24.08.2026");
  assert.equal(formatSwissDate("24.8.2026"), "24.08.2026");
  assert.equal(formatSwissDate(""), "–");
  assert.equal(formatSwissDate(null), "–");
});

test("formatSwissDateTime uses Europe/Zurich (summer UTC+2, winter UTC+1)", () => {
  assert.equal(
    formatSwissDateTime("2026-08-24T12:30:00.000Z"),
    "24.08.2026 14:30"
  );
  assert.equal(
    formatSwissDateTime("2026-01-15T12:30:00.000Z"),
    "15.01.2026 13:30"
  );
  assert.equal(
    formatSwissDateTime("2026-08-24T14:30:00+02:00"),
    "24.08.2026 14:30"
  );
});

test("formatSwissDateTime keeps date-only fields without dummy 00:00", () => {
  assert.equal(formatSwissDateTime("2026-08-24"), "24.08.2026");
  assert.equal(formatSwissDateTime("2026-08-24T00:00:00"), "24.08.2026");
  assert.equal(formatSwissDateTime("2026-08-24T00:00:00.000Z"), "24.08.2026");
});

test("toSwissWeekday is calendar-day safe (no UTC shift of YYYY-MM-DD)", () => {
  assert.equal(toSwissWeekday("2026-08-08"), "Samstag");
  assert.equal(toSwissWeekday("08.08.2026"), "Samstag");
  assert.equal(toSwissWeekday("2026-08-24"), "Montag");
  assert.equal(toSwissWeekday("2026-01-01"), "Donnerstag");
  assert.equal(toSwissWeekday(""), "");
  assert.equal(toSwissWeekday(null), "");
});

test("formatSwissDateRange formats week spans", () => {
  assert.equal(
    formatSwissDateRange("2026-08-24", "2026-08-30"),
    "24.08.2026 – 30.08.2026"
  );
  assert.equal(formatSwissDateRange("2026-08-24", "2026-08-24"), "24.08.2026");
});
