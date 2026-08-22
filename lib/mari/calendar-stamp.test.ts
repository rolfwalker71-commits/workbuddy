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
  const { listPendingMariCalendarStamps, upsertMariCalendarStamp } =
    await import("./calendar-stamp.ts");

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
});
