import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_PUBLIC_HOLIDAYS_MAILBOX,
  mapPublicHolidayEvents,
  normalizePublicHolidaysMailbox,
} from "./public-holidays-calendar.ts";

test("normalizePublicHolidaysMailbox defaults to ww_public_holidays", () => {
  assert.equal(
    normalizePublicHolidaysMailbox(null),
    COMPANY_PUBLIC_HOLIDAYS_MAILBOX
  );
  assert.equal(
    normalizePublicHolidaysMailbox("  WW_Public_Holidays@an-group.one "),
    "ww_public_holidays@an-group.one"
  );
});

test("mapPublicHolidayEvents expands all-day spans and reads countries", () => {
  const rows = mapPublicHolidayEvents({
    id: "xmas",
    subject: "Christmas CH / DE",
    start: { dateTime: "2026-12-25T00:00:00" },
    end: { dateTime: "2026-12-27T00:00:00" },
    isAllDay: true,
    categories: ["Mexico"],
  });
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-12-25", "2026-12-26"]
  );
  assert.deepEqual(rows[0]?.countries, ["CH", "DE", "MX"]);
});

test("mapPublicHolidayEvents reads country from calendar name", () => {
  const rows = mapPublicHolidayEvents(
    {
      id: "np",
      subject: "Constitution Day",
      start: { dateTime: "2026-09-19T00:00:00" },
      end: { dateTime: "2026-09-20T00:00:00" },
      isAllDay: true,
    },
    "NP Holidays"
  );
  assert.deepEqual(rows[0]?.countries, ["NP"]);
});
