import assert from "node:assert/strict";
import test from "node:test";
import { addDaysYmd } from "./timekeeping-shared.ts";
import {
  expandSeriesDates,
  isoWeekdayUtc,
  seriesMonthEnd,
  seriesWeekRange,
} from "./time-series.ts";

test("expandSeriesDates expands selected weekdays in range", () => {
  const result = expandSeriesDates({
    from: "2026-09-07",
    to: "2026-09-20",
    weekdays: [1, 3],
  });
  assert.deepEqual(result, {
    ok: true,
    dates: ["2026-09-07", "2026-09-09", "2026-09-14", "2026-09-16"],
  });
});

test("expandSeriesDates empty weekday selection yields no dates", () => {
  const result = expandSeriesDates({
    from: "2026-09-07",
    to: "2026-09-13",
    weekdays: [],
  });
  assert.deepEqual(result, { ok: true, dates: [] });
});

test("expandSeriesDates ignores invalid weekday numbers", () => {
  const result = expandSeriesDates({
    from: "2026-09-07",
    to: "2026-09-13",
    weekdays: [0, 8, 1.5],
  });
  assert.deepEqual(result, { ok: true, dates: [] });
});

test("expandSeriesDates rejects inverted and invalid ranges", () => {
  assert.deepEqual(
    expandSeriesDates({
      from: "2026-09-13",
      to: "2026-09-07",
      weekdays: [1],
    }),
    { ok: false, error: "range-inverted" }
  );
  assert.deepEqual(
    expandSeriesDates({ from: "nope", to: "2026-09-07", weekdays: [1] }),
    { ok: false, error: "invalid-from" }
  );
  assert.deepEqual(
    expandSeriesDates({ from: "2026-09-07", to: "2026-02-30", weekdays: [1] }),
    { ok: false, error: "invalid-to" }
  );
});

test("expandSeriesDates rejects a span longer than 90 days", () => {
  const result = expandSeriesDates({
    from: "2026-01-01",
    to: "2026-04-01",
    weekdays: [1],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "span-cap");
});

test("expandSeriesDates allows a 90-day inclusive span", () => {
  const result = expandSeriesDates({
    from: "2026-01-01",
    to: "2026-03-31",
    weekdays: [1],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.dates.length > 0);
    assert.ok(result.dates.length <= 52);
    assert.equal(result.dates[0], "2026-01-05");
  }
});

test("expandSeriesDates rejects more than 52 occurrences", () => {
  const from = "2026-09-07";
  const to = addDaysYmd(from, 52);
  const result = expandSeriesDates({
    from,
    to,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "count-cap");
});

test("expandSeriesDates allows 52 occurrences", () => {
  const from = "2026-09-07";
  const to = addDaysYmd(from, 51);
  const result = expandSeriesDates({
    from,
    to,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.dates.length, 52);
});

test("iso weekday is Monday=1 through Sunday=7", () => {
  assert.equal(isoWeekdayUtc("2026-09-07"), 1);
  assert.equal(isoWeekdayUtc("2026-09-08"), 2);
  assert.equal(isoWeekdayUtc("2026-09-09"), 3);
  assert.equal(isoWeekdayUtc("2026-09-10"), 4);
  assert.equal(isoWeekdayUtc("2026-09-11"), 5);
  assert.equal(isoWeekdayUtc("2026-09-12"), 6);
  assert.equal(isoWeekdayUtc("2026-09-13"), 7);
  assert.equal(isoWeekdayUtc("not-a-date"), null);
});

test("series week is Monday through Sunday around a mid-week anchor", () => {
  assert.deepEqual(seriesWeekRange("2026-09-09"), {
    from: "2026-09-07",
    to: "2026-09-13",
  });
  assert.deepEqual(seriesWeekRange("2026-09-13"), {
    from: "2026-09-07",
    to: "2026-09-13",
  });
  assert.deepEqual(seriesWeekRange("2026-09-07"), {
    from: "2026-09-07",
    to: "2026-09-13",
  });
  assert.deepEqual(
    expandSeriesDates({
      from: "2026-09-07",
      to: "2026-09-13",
      weekdays: [1, 7],
    }),
    { ok: true, dates: ["2026-09-07", "2026-09-13"] }
  );
});

test("seriesMonthEnd is the last calendar day of the month", () => {
  assert.equal(seriesMonthEnd("2026-09-07"), "2026-09-30");
  assert.equal(seriesMonthEnd("2026-02-03"), "2026-02-28");
});
