import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonthsYmd,
  monthGridDays,
  monthStartYmd,
  sameCalendarMonth,
} from "./month-grid.ts";

test("month grid for September 2026 starts Monday 31 Aug and is 5 weeks", () => {
  const days = monthGridDays("2026-09-15");
  assert.equal(days[0], "2026-08-31");
  assert.equal(days.at(-1), "2026-10-04");
  assert.equal(days.length, 35);
  assert.equal(sameCalendarMonth(days[1], "2026-09-01"), true);
  assert.equal(sameCalendarMonth(days[0], "2026-09-01"), false);
});

test("month grid for August 2026 keeps a sixth week for the 31st", () => {
  const days = monthGridDays("2026-08-30");
  assert.equal(days[0], "2026-07-27");
  assert.equal(days.includes("2026-08-31"), true);
  assert.equal(days.at(-1), "2026-09-06");
  assert.equal(days.length, 42);
});

test("addMonthsYmd uses the first of the month", () => {
  assert.equal(monthStartYmd("2026-08-30"), "2026-08-01");
  assert.equal(addMonthsYmd("2026-01-31", 1), "2026-02-01");
  assert.equal(addMonthsYmd("2026-08-30", 1), "2026-09-01");
});
