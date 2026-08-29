import test from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_DAY_LOOKBACK_DAYS,
  CALENDAR_RANGE_MAX_DAYS,
  calendarDayLookbackFrom,
  clampCalendarDay,
  inclusiveDayCount,
  parseCalendarDateRange,
  parseCalendarDay,
} from "./date-range.ts";

test("default window is today plus 89 days (90 inkl.)", () => {
  const parsed = parseCalendarDateRange(null, null, "2026-08-24");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.range.from, "2026-08-24");
  assert.equal(parsed.range.to, "2026-11-21");
  assert.equal(parsed.range.days, CALENDAR_RANGE_MAX_DAYS);
});

test("rejects inverted and oversized ranges", () => {
  const inverted = parseCalendarDateRange("2026-09-01", "2026-08-01");
  assert.equal(inverted.ok, false);

  const oversized = parseCalendarDateRange("2026-08-24", "2026-11-22");
  assert.equal(oversized.ok, false);
  assert.equal(inclusiveDayCount("2026-08-24", "2026-11-21"), 90);
  assert.equal(inclusiveDayCount("2026-08-24", "2026-11-22"), 91);
});

test("accepts a single day and validates YMD", () => {
  const day = parseCalendarDateRange("2026-08-24", "2026-08-24");
  assert.equal(day.ok, true);
  if (day.ok) assert.equal(day.range.days, 1);

  const bad = parseCalendarDateRange("24.08.2026", null);
  assert.equal(bad.ok, false);
});

test("calendar day lookback is 60 inclusive days through today", () => {
  assert.equal(CALENDAR_DAY_LOOKBACK_DAYS, 60);
  assert.equal(calendarDayLookbackFrom("2026-08-29"), "2026-07-01");
  assert.equal(clampCalendarDay(null, "2026-08-29"), "2026-08-29");
  assert.equal(clampCalendarDay("2026-07-15", "2026-08-29"), "2026-07-15");
  assert.equal(clampCalendarDay("2026-06-29", "2026-08-29"), "2026-07-01");
  assert.equal(clampCalendarDay("2026-09-01", "2026-08-29"), "2026-08-29");

  const parsed = parseCalendarDay("2026-07-01", "2026-08-29");
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.date, "2026-07-01");

  const invalid = parseCalendarDay("29.08.2026", "2026-08-29");
  assert.equal(invalid.ok, false);
});
