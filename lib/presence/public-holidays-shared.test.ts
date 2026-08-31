import assert from "node:assert/strict";
import test from "node:test";
import {
  displayPublicHolidayTitle,
  formatPublicHolidayCountries,
  groupPublicHolidaysByDay,
  isPublicHolidayCalendarHint,
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
  assert.deepEqual(days[0]?.titles, ["Christmas", "Weihnachten", "Navidad"]);
  assert.deepEqual(days[0]?.items, [
    { title: "Christmas", countries: ["CH"] },
    { title: "Weihnachten", countries: ["DE"] },
    { title: "Navidad", countries: ["MX"] },
  ]);
  assert.deepEqual(days[1]?.countries, ["AT"]);
  assert.equal(formatPublicHolidayCountries(days[0]!.countries), "CH · DE · MX");
  const unnamed = groupPublicHolidaysByDay([
    { id: "x", date: "2026-12-24", subject: "Weihnachten", countries: [] },
  ]);
  assert.equal(unnamed[0]?.date, "2026-12-24");
  assert.deepEqual(unnamed[0]?.countries, []);
  assert.deepEqual(unnamed[0]?.titles, ["Weihnachten"]);
  assert.deepEqual(unnamed[0]?.items, [
    { title: "Weihnachten", countries: [] },
  ]);
});

test("displayPublicHolidayTitle strips country codes", () => {
  assert.equal(displayPublicHolidayTitle("Christmas CH / DE"), "Christmas");
  assert.equal(displayPublicHolidayTitle("CH - Weihnachten"), "Weihnachten");
  assert.equal(displayPublicHolidayTitle("Weihnachten"), "Weihnachten");
});

test("isPublicHolidayCalendarHint matches shared mailbox names", () => {
  assert.equal(isPublicHolidayCalendarHint("Public Holidays"), true);
  assert.equal(isPublicHolidayCalendarHint("CH Holidays"), true);
  assert.equal(isPublicHolidayCalendarHint("Feiertage AT"), true);
  assert.equal(isPublicHolidayCalendarHint("Festivos MX"), true);
  assert.equal(isPublicHolidayCalendarHint("Feriados"), true);
  assert.equal(isPublicHolidayCalendarHint("Kalender"), false);
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
