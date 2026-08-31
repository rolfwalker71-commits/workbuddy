import assert from "node:assert/strict";
import test from "node:test";
import {
  ICS_CALENDAR_TYPES,
  isWorkCalendarType,
  normalizeIcsCalendarType,
} from "./ics-types.ts";

test("picker types no longer include personal or hobby calendars", () => {
  assert.deepEqual([...ICS_CALENDAR_TYPES], [
    "school",
    "birthday",
    "work",
    "holiday",
    "private",
    "other",
  ]);
});

test("normalizeIcsCalendarType maps leftover assignments", () => {
  assert.equal(normalizeIcsCalendarType("work_rolf"), "work");
  assert.equal(normalizeIcsCalendarType("work_valentyna"), "work");
  assert.equal(normalizeIcsCalendarType("family"), "private");
  assert.equal(normalizeIcsCalendarType("hockey"), "other");
  assert.equal(normalizeIcsCalendarType("waste"), "other");
  assert.equal(normalizeIcsCalendarType("church"), "other");
  assert.equal(normalizeIcsCalendarType("sports"), "other");
  assert.equal(normalizeIcsCalendarType("birthday"), "birthday");
  assert.equal(normalizeIcsCalendarType(""), undefined);
});

test("isWorkCalendarType treats mapped Arbeit types as work", () => {
  assert.equal(isWorkCalendarType("work"), true);
  assert.equal(isWorkCalendarType("work_rolf"), true);
  assert.equal(isWorkCalendarType("private"), false);
});
