import assert from "node:assert/strict";
import test from "node:test";
import {
  dayCloseScheduleFromStart,
  dayCloseSettingKey,
  parseDayClosePrefsJson,
  parseDayCloseStartHm,
} from "./day-close-prefs-parse.ts";

test("dayCloseSettingKey is per user", () => {
  assert.equal(dayCloseSettingKey(3), "day_close_time_u3");
  assert.notEqual(dayCloseSettingKey(3), dayCloseSettingKey(4));
});

test("parseDayCloseStartHm clamps and defaults", () => {
  assert.equal(parseDayCloseStartHm(null), "18:30");
  assert.equal(parseDayCloseStartHm("17:00"), "17:00");
  assert.equal(parseDayCloseStartHm("7:05"), "07:05");
  assert.equal(parseDayCloseStartHm("05:00"), "06:00");
  assert.equal(parseDayCloseStartHm("23:00"), "22:00");
  assert.equal(parseDayCloseStartHm("nope"), "18:30");
});

test("schedule is start plus 15 minutes", () => {
  assert.deepEqual(dayCloseScheduleFromStart("17:00"), {
    startHm: "17:00",
    endHm: "17:15",
  });
  assert.deepEqual(parseDayClosePrefsJson('{"startHm":"16:45"}'), {
    startHm: "16:45",
    endHm: "17:00",
  });
});
