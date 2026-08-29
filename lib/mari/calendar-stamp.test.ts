import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("calendar stamps are owner-scoped", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-stamp-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const {
    deleteMariCalendarStamp,
    listPendingMariCalendarStamps,
    upsertMariCalendarStamp,
  } = await import("./calendar-stamp.ts");

  upsertMariCalendarStamp({
    userId: 1,
    eventId: "evt-a",
    issueId: 10,
    eventDate: "2026-08-22",
    startHm: "09:00",
    endHm: "10:00",
    title: "Ticket A",
  });
  upsertMariCalendarStamp({
    userId: 2,
    eventId: "evt-b",
    issueId: 11,
    eventDate: "2026-08-22",
    startHm: "11:00",
    endHm: "12:00",
    title: "Ticket B",
  });

  const one = listPendingMariCalendarStamps(1, { onDate: "2026-08-22" });
  const two = listPendingMariCalendarStamps(2, { onDate: "2026-08-22" });
  assert.equal(one.length, 1);
  assert.equal(one[0]?.eventId, "evt-a");
  assert.equal(two.length, 1);
  assert.equal(two[0]?.eventId, "evt-b");
  assert.equal(one[0]?.userId, 1);

  assert.equal(deleteMariCalendarStamp(1, "microsoft", "evt-a"), true);
  assert.equal(listPendingMariCalendarStamps(1, { onDate: "2026-08-22" }).length, 0);
  assert.equal(listPendingMariCalendarStamps(2, { onDate: "2026-08-22" }).length, 1);
  assert.equal(deleteMariCalendarStamp(1, "microsoft", "evt-a"), false);
});

test("markMariCalendarEventBooked stamps hours-only and keeps ticket issueId", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-stamp-booked-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const {
    HOURS_ONLY_STAMP_ISSUE_ID,
    listPendingMariCalendarStamps,
    markMariCalendarEventBooked,
    upsertMariCalendarStamp,
  } = await import("./calendar-stamp.ts");

  const hoursOnly = markMariCalendarEventBooked({
    userId: 1,
    eventId: "outlook-normal",
    eventDate: "2026-08-29",
    startHm: "09:00",
    endHm: "10:00",
    title: "Kundentermin",
    hours: 1.5,
    bookedLineId: 77,
  });
  assert.equal(hoursOnly.status, "booked");
  assert.equal(hoursOnly.issueId, HOURS_ONLY_STAMP_ISSUE_ID);
  assert.equal(hoursOnly.hours, 1.5);
  assert.equal(hoursOnly.bookedLineId, 77);
  assert.equal(
    listPendingMariCalendarStamps(1, { onDate: "2026-08-29" }).length,
    0
  );

  upsertMariCalendarStamp({
    userId: 1,
    eventId: "ticket-evt",
    issueId: 88,
    eventDate: "2026-08-29",
    startHm: "11:00",
    endHm: "12:00",
    title: "Ticket-Termin",
  });
  const after = markMariCalendarEventBooked({
    userId: 1,
    eventId: "ticket-evt",
    issueId: 0,
    eventDate: "2026-08-29",
    title: "Ticket-Termin",
    hours: 0.5,
  });
  assert.equal(after.issueId, 88);
  assert.equal(after.status, "booked");
  assert.equal(
    listPendingMariCalendarStamps(1, { onOrBeforeDate: "2026-08-29" }).length,
    0
  );
});
