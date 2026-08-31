import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarViewWindow,
  COMPANY_PUBLIC_HOLIDAYS_MAILBOX,
  isSharedHolidayCalendar,
  mapPublicHolidayEvents,
  normalizePublicHolidaysMailbox,
  shouldPersistHolidayReader,
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

test("calendarViewWindow uses exclusive next-midnight end", () => {
  assert.deepEqual(calendarViewWindow("2026-12-21", "2026-12-25"), {
    start: "2026-12-21T00:00:00",
    end: "2026-12-26T00:00:00",
  });
});

test("isSharedHolidayCalendar matches mailbox owner, hint, or country", () => {
  assert.equal(
    isSharedHolidayCalendar(
      { name: "Kalender", owner: { address: "ww_public_holidays@an-group.one" } },
      COMPANY_PUBLIC_HOLIDAYS_MAILBOX
    ),
    true
  );
  assert.equal(
    isSharedHolidayCalendar(
      { name: "Festivos MX", owner: { address: "other@an-group.one" } },
      COMPANY_PUBLIC_HOLIDAYS_MAILBOX
    ),
    true
  );
  assert.equal(
    isSharedHolidayCalendar(
      { name: "Switzerland", owner: { address: "other@an-group.one" } },
      COMPANY_PUBLIC_HOLIDAYS_MAILBOX
    ),
    true
  );
  assert.equal(
    isSharedHolidayCalendar(
      { name: "Team sync", owner: { address: "other@an-group.one" } },
      COMPANY_PUBLIC_HOLIDAYS_MAILBOX
    ),
    false
  );
});

test("shouldPersistHolidayReader skips empty Graph results", () => {
  assert.equal(shouldPersistHolidayReader(0), false);
  assert.equal(shouldPersistHolidayReader(2), true);
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
