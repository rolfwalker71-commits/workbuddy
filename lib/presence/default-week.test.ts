import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultStatusForYmd,
  parsePresenceDefaultWeek,
  serializePresenceDefaultWeek,
  weekdayKeyForYmd,
} from "./default-week.ts";

test("weekdayKeyForYmd maps Monday–Friday and ignores weekend", () => {
  assert.equal(weekdayKeyForYmd("2026-08-24"), "mon");
  assert.equal(weekdayKeyForYmd("2026-08-25"), "tue");
  assert.equal(weekdayKeyForYmd("2026-08-26"), "wed");
  assert.equal(weekdayKeyForYmd("2026-08-27"), "thu");
  assert.equal(weekdayKeyForYmd("2026-08-28"), "fri");
  assert.equal(weekdayKeyForYmd("2026-08-29"), null);
  assert.equal(weekdayKeyForYmd("2026-08-23"), null);
});

test("parsePresenceDefaultWeek keeps valid weekday statuses only", () => {
  const week = parsePresenceDefaultWeek({
    mon: "office",
    tue: "home",
    wed: "nope",
    sat: "office",
    fri: "vacation",
  });
  assert.deepEqual(week, { mon: "office", tue: "home", fri: "vacation" });
  assert.deepEqual(parsePresenceDefaultWeek("not-json"), {});
  assert.deepEqual(parsePresenceDefaultWeek(null), {});
});

test("serialize and defaultStatusForYmd round-trip weekdays", () => {
  const json = serializePresenceDefaultWeek({
    mon: "office",
    wed: "sick",
    fri: "home",
  });
  const week = parsePresenceDefaultWeek(json);
  assert.equal(defaultStatusForYmd(week, "2026-08-24"), "office");
  assert.equal(defaultStatusForYmd(week, "2026-08-25"), null);
  assert.equal(defaultStatusForYmd(week, "2026-08-26"), "sick");
  assert.equal(defaultStatusForYmd(week, "2026-08-28"), "home");
  assert.equal(defaultStatusForYmd(week, "2026-08-29"), null);
});
