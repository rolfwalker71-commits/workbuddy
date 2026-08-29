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
    hoursBillable: 1,
    bookedLineId: 77,
    customerName: "Filados AG",
    projectNumber: "P600111",
    contractVisible: "V60011100",
  });
  assert.equal(hoursOnly.status, "booked");
  assert.equal(hoursOnly.issueId, HOURS_ONLY_STAMP_ISSUE_ID);
  assert.equal(hoursOnly.hours, 1.5);
  assert.equal(hoursOnly.hoursBillable, 1);
  assert.equal(hoursOnly.customerName, "Filados AG");
  assert.equal(hoursOnly.projectNumber, "P600111");
  assert.equal(hoursOnly.contractVisible, "V60011100");
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

test("booking pin on series key is found on later occurrences", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-stamp-series-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const {
    getMariCalendarStampForEvent,
    upsertMariCalendarBookingRef,
  } = await import("./calendar-stamp.ts");

  upsertMariCalendarBookingRef({
    userId: 1,
    eventId: "occurrence-monday",
    seriesKey: "master-weekly",
    eventDate: "2026-08-24",
    startHm: "09:00",
    endHm: "09:30",
    title: "Daily Infra",
    projectNumber: "P100",
    projectLabel: "Infra Intern",
    contractId: 0,
  });

  const later = getMariCalendarStampForEvent(
    1,
    "occurrence-tuesday",
    "master-weekly"
  );
  assert.ok(later);
  assert.equal(later.eventId, "master-weekly");
  assert.equal(later.seriesKey, "master-weekly");
  assert.equal(later.projectNumber, "P100");
  assert.equal(later.bookingPinned, true);
  assert.equal(later.issueId, 0);
});

test("booked occurrence keeps series pin and does not mark siblings booked", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-stamp-occ-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const {
    markMariCalendarEventBooked,
    resolveMariCalendarStampForEvent,
    upsertMariCalendarBookingRef,
  } = await import("./calendar-stamp.ts");
  const { hoursSplitFromStamp } = await import(
    "../workspace/event-mari-shared.ts"
  );

  upsertMariCalendarBookingRef({
    userId: 1,
    eventId: "occurrence-monday",
    seriesKey: "master-weekly",
    eventDate: "2026-08-24",
    startHm: "09:00",
    endHm: "10:00",
    title: "Daily Infra",
    customerName: "Intern",
    projectNumber: "P100",
    projectLabel: "Infra Intern",
    contractId: 0,
  });

  markMariCalendarEventBooked({
    userId: 1,
    eventId: "occurrence-monday",
    seriesKey: "master-weekly",
    eventDate: "2026-08-24",
    title: "Daily Infra",
    hours: 1,
    hoursBillable: 0.75,
  });

  const monday = resolveMariCalendarStampForEvent(
    1,
    "occurrence-monday",
    "master-weekly"
  );
  assert.ok(monday);
  assert.equal(monday.status, "booked");
  assert.equal(monday.hours, 1);
  assert.equal(monday.hoursBillable, 0.75);
  assert.equal(monday.projectNumber, "P100");
  assert.equal(monday.customerName, "Intern");
  const split = hoursSplitFromStamp(monday.hours, monday.hoursBillable);
  assert.equal(split.billable, 0.75);
  assert.equal(split.nonBillable, 0.25);

  const tuesday = resolveMariCalendarStampForEvent(
    1,
    "occurrence-tuesday",
    "master-weekly"
  );
  assert.ok(tuesday);
  assert.equal(tuesday.status, "pending");
  assert.equal(tuesday.projectNumber, "P100");
  assert.equal(tuesday.bookingPinned, true);
});
