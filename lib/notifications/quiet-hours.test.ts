import assert from "node:assert/strict";
import test from "node:test";
import {
  isWithinQuietWindow,
  quietHoursSuppresses,
  QUIET_HOURS_EXEMPT_REASONS,
} from "./quiet-hours.ts";
import type { QuietHoursPrefs } from "../realtime/prefs.ts";

const WINDOW: QuietHoursPrefs = {
  enabled: true,
  startHm: "08:00",
  endHm: "18:30",
  weekdaysOnly: true,
};

// 2026-09-16 ist ein Mittwoch, 2026-09-19 ein Samstag.
const WEEKDAY = "2026-09-16";
const SATURDAY = "2026-09-19";

function check(patch: Partial<Parameters<typeof quietHoursSuppresses>[0]> = {}) {
  return quietHoursSuppresses({
    reason: "mari_ticket_status",
    nowHm: "10:00",
    ymd: WEEKDAY,
    window: WINDOW,
    presenceStatus: "office",
    ...patch,
  });
}

test("inside the working window nothing is suppressed", () => {
  assert.equal(check(), false);
  assert.equal(check({ nowHm: "08:00" }), false);
  assert.equal(check({ nowHm: "18:29" }), false);
});

test("outside the window the push is suppressed", () => {
  assert.equal(check({ nowHm: "07:59" }), true);
  assert.equal(check({ nowHm: "18:30" }), true);
  assert.equal(check({ nowHm: "23:15" }), true);
});

test("weekends are suppressed only while weekdaysOnly is set", () => {
  assert.equal(check({ ymd: SATURDAY }), true);
  assert.equal(
    check({ ymd: SATURDAY, window: { ...WINDOW, weekdaysOnly: false } }),
    false
  );
});

test("absence suppresses the whole day regardless of the clock", () => {
  for (const status of ["vacation", "sick", "absent"] as const) {
    assert.equal(check({ presenceStatus: status }), true, status);
  }
  // Anwesend im Büro oder Home Office ist Arbeitszeit.
  assert.equal(check({ presenceStatus: "home" }), false);
  // Keine Präsenz hinterlegt darf nicht als abwesend gelten.
  assert.equal(check({ presenceStatus: null }), false);
});

test("quiet hours switched off suppress nothing", () => {
  assert.equal(
    check({ nowHm: "03:00", window: { ...WINDOW, enabled: false } }),
    false
  );
});

test("the evening digest ignores quiet hours", () => {
  // Es feuert per Definition am Ende des Arbeitstags und hat ein eigenes
  // Fenster — ein zweites Gate würde es still abschalten.
  assert.ok(QUIET_HOURS_EXEMPT_REASONS.has("evening_digest"));
  assert.equal(
    check({ reason: "evening_digest", nowHm: "19:00", presenceStatus: "vacation" }),
    false
  );
  assert.equal(check({ reason: "app_status", nowHm: "03:00" }), false);
});

test("a window spanning midnight is handled", () => {
  assert.equal(isWithinQuietWindow(23 * 60, 22 * 60, 6 * 60), true);
  assert.equal(isWithinQuietWindow(2 * 60, 22 * 60, 6 * 60), true);
  assert.equal(isWithinQuietWindow(12 * 60, 22 * 60, 6 * 60), false);
});

test("an equal start and end means the whole day is working time", () => {
  assert.equal(isWithinQuietWindow(3 * 60, 9 * 60, 9 * 60), true);
});
