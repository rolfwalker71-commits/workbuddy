import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDayCloseRitualItem,
  countOpenPlanningEvents,
  DAY_CLOSE_RITUAL_ID,
  DAY_CLOSE_TIME,
  isDayCloseRitualComplete,
  isDayCloseRitualId,
  isZurichWeekday,
  ritualAsMsCalendarEvent,
  withDayCloseRitual,
  withDayCloseRitualMsEvents,
} from "./day-close-ritual.ts";

test("isZurichWeekday is Mo–Fr only", () => {
  assert.equal(isZurichWeekday("2026-08-21"), true); // Friday
  assert.equal(isZurichWeekday("2026-08-22"), false); // Saturday
  assert.equal(isZurichWeekday("2026-08-23"), false); // Sunday
  assert.equal(isZurichWeekday("2026-08-24"), true); // Monday
});

test("withDayCloseRitual skips weekends and strips leftover ritual", () => {
  const weekend = withDayCloseRitual(
    [
      {
        id: "meet",
        date: "2026-08-22",
        time: "10:00",
        title: "Sync",
      },
      {
        id: DAY_CLOSE_RITUAL_ID,
        date: "2026-08-22",
        time: DAY_CLOSE_TIME,
        title: "Tagesabschluss",
      },
    ],
    "2026-08-22"
  );
  assert.equal(weekend.length, 1);
  assert.equal(weekend[0]?.id, "meet");
  assert.ok(!weekend.some((i) => isDayCloseRitualId(i.id)));
});

test("withDayCloseRitual injects weekday item at 18:30 and sorts", () => {
  const items = withDayCloseRitual(
    [
      { id: "late", date: "2026-08-24", time: "19:00", title: "Abend" },
      { id: "am", date: "2026-08-24", time: "09:00", title: "Standup" },
    ],
    "2026-08-24"
  );
  assert.equal(items.length, 3);
  assert.equal(items[0]?.id, "am");
  assert.equal(items[1]?.id, DAY_CLOSE_RITUAL_ID);
  assert.equal(items[2]?.id, "late");
  const ritual = buildDayCloseRitualItem("2026-08-24");
  assert.equal(ritual.time, "18:30");
  assert.equal(ritual.endTime, "18:45");
  assert.equal(ritual.calendarId, "buddy-ritual");
  assert.equal(ritual.title, "Tagesabschluss");
});

test("open-calendar count ignores ritual and non-planning / done titles", () => {
  const open = countOpenPlanningEvents("2026-08-24", [
    {
      id: DAY_CLOSE_RITUAL_ID,
      title: "Tagesabschluss",
      date: "2026-08-24",
      planningRelevant: true,
    },
    {
      id: "a",
      title: "Standup",
      date: "2026-08-24",
      planningRelevant: true,
    },
    {
      id: "b",
      title: "✅ Review",
      date: "2026-08-24",
      planningRelevant: true,
    },
    {
      id: "c",
      title: "Feiertag",
      date: "2026-08-24",
      planningRelevant: false,
    },
    {
      id: "d",
      title: "Morgen",
      date: "2026-08-25",
      planningRelevant: true,
    },
  ]);
  assert.equal(open, 1);
});

test("completeness requires closed calendar, mail days, and Maringo stamps", () => {
  assert.equal(isDayCloseRitualComplete(null), false);
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 1,
      googleDayDone: true,
      microsoftDayDone: true,
      mariHoursPending: 0,
    }),
    false
  );
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 0,
      googleDayDone: false,
      microsoftDayDone: true,
      mariHoursPending: 0,
    }),
    false
  );
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 0,
      googleDayDone: true,
      microsoftDayDone: false,
      mariHoursPending: 0,
    }),
    false
  );
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 0,
      googleDayDone: true,
      microsoftDayDone: true,
      mariHoursPending: 2,
    }),
    false
  );
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 0,
      googleDayDone: true,
      microsoftDayDone: true,
      mariHoursPending: 0,
    }),
    true
  );
  assert.equal(
    isDayCloseRitualComplete({
      calendarOpen: 0,
      googleDayDone: null,
      microsoftDayDone: true,
      mariHoursPending: null,
    }),
    true
  );
});

test("complete ritual title is marked done and maps to MsCalendarEvent", () => {
  const item = buildDayCloseRitualItem("2026-08-24", {
    calendarOpen: 0,
    googleDayDone: true,
    microsoftDayDone: null,
    mariHoursPending: null,
  });
  assert.equal(item.title, "✅ Tagesabschluss");
  const ev = ritualAsMsCalendarEvent(item);
  assert.equal(ev.id, DAY_CLOSE_RITUAL_ID);
  assert.equal(ev.startHm, "18:30");
  assert.equal(ev.endHm, "18:45");
  assert.equal(ev.done, true);
  const injected = withDayCloseRitualMsEvents([], "2026-08-24", {
    calendarOpen: 0,
    googleDayDone: true,
    microsoftDayDone: null,
    mariHoursPending: null,
  });
  assert.equal(injected[0]?.subject, "✅ Tagesabschluss");
});
