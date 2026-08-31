import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPublicHolidayCountries,
  groupPublicHolidaysByDay,
  parsePublicHolidayCountries,
  publicHolidayLookaheadRange,
} from "./public-holidays-shared.ts";

test("parsePublicHolidayCountries reads ISO codes and names", () => {
  assert.deepEqual(parsePublicHolidayCountries("CH / AT — Christmas"), [
    "CH",
    "AT",
  ]);
  assert.deepEqual(parsePublicHolidayCountries("Weihnachten Deutschland"), [
    "DE",
  ]);
  assert.deepEqual(parsePublicHolidayCountries("Día de la Independencia Mexico"), [
    "MX",
  ]);
  assert.deepEqual(parsePublicHolidayCountries("Independencia de Mexico"), [
    "MX",
  ]);
  assert.deepEqual(parsePublicHolidayCountries("Nepal Constitution Day"), [
    "NP",
  ]);
  assert.deepEqual(parsePublicHolidayCountries("Switzerland / Österreich"), [
    "CH",
    "AT",
  ]);
  assert.deepEqual(parsePublicHolidayCountries("CH AT DE MX NP"), [
    "CH",
    "AT",
    "DE",
    "MX",
    "NP",
  ]);
  assert.deepEqual(parsePublicHolidayCountries("Team sync"), []);
});

test("groupPublicHolidaysByDay merges countries on the same date", () => {
  const days = groupPublicHolidaysByDay([
    { id: "1", date: "2026-12-25", subject: "Christmas CH", countries: ["CH"] },
    { id: "2", date: "2026-12-25", subject: "Weihnachten DE", countries: ["DE"] },
    { id: "3", date: "2026-12-25", subject: "Navidad MX", countries: ["MX"] },
    { id: "4", date: "2026-12-26", subject: "Stephanstag AT", countries: ["AT"] },
  ]);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0]?.countries, ["CH", "DE", "MX"]);
  assert.equal(days[0]?.titles.length, 3);
  assert.deepEqual(days[1]?.countries, ["AT"]);
  assert.equal(formatPublicHolidayCountries(days[0]!.countries), "CH · DE · MX");
  assert.deepEqual(
    groupPublicHolidaysByDay([
      { id: "x", date: "2026-12-24", subject: "Team lunch", countries: [] },
    ]),
    []
  );
});

test("publicHolidayLookaheadRange keeps December through New Year", () => {
  assert.deepEqual(publicHolidayLookaheadRange("2026-08-31"), {
    from: "2026-08-31",
    to: "2026-09-14",
  });
  assert.deepEqual(publicHolidayLookaheadRange("2026-12-15"), {
    from: "2026-12-15",
    to: "2027-01-02",
  });
});
