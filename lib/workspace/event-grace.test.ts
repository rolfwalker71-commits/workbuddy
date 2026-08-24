import test from "node:test";
import assert from "node:assert/strict";
import {
  filterAblaufTimelineItems,
  filterTodayEventsAfterGrace,
  isAgendaItemPastGrace,
} from "./event-grace.ts";

function item(
  partial: { id: string; date: string } & Record<string, unknown>
) {
  return {
    time: null as string | null,
    endTime: null as string | null,
    ...partial,
  };
}

test("isAgendaItemPastGrace hides after end + 30 min", () => {
  const meeting = item({
    id: "1",
    date: "2026-08-07",
    title: "Call",
    time: "08:00",
    endTime: "08:25",
  });
  assert.equal(
    isAgendaItemPastGrace(meeting, "2026-08-07", "08:54"),
    false
  );
  assert.equal(
    isAgendaItemPastGrace(meeting, "2026-08-07", "08:55"),
    true
  );
});

test("isAgendaItemPastGrace treats missing end as start + 60 then + 30", () => {
  const meeting = item({
    id: "1",
    date: "2026-08-24",
    time: "10:00",
    endTime: null,
  });
  assert.equal(isAgendaItemPastGrace(meeting, "2026-08-24", "11:29"), false);
  assert.equal(isAgendaItemPastGrace(meeting, "2026-08-24", "11:30"), true);
});

test("isAgendaItemPastGrace keeps all-day until 23:59", () => {
  const allDay = item({
    id: "1",
    date: "2026-08-24",
    time: null,
    isAllDay: true,
  });
  assert.equal(isAgendaItemPastGrace(allDay, "2026-08-24", "18:00"), false);
  assert.equal(isAgendaItemPastGrace(allDay, "2026-08-24", "23:58"), false);
  assert.equal(isAgendaItemPastGrace(allDay, "2026-08-24", "23:59"), true);
});

test("isAgendaItemPastGrace reads startHm/endHm aliases", () => {
  const meeting = item({
    id: "1",
    date: "2026-08-24",
    startHm: "09:00",
    endHm: "09:30",
  });
  assert.equal(isAgendaItemPastGrace(meeting, "2026-08-24", "09:59"), false);
  assert.equal(isAgendaItemPastGrace(meeting, "2026-08-24", "10:00"), true);
});

test("filterTodayEventsAfterGrace drops only past items", () => {
  const items = [
    item({
      id: "past",
      date: "2026-08-24",
      time: "09:00",
      endTime: "10:00",
    }),
    item({
      id: "live",
      date: "2026-08-24",
      time: "16:00",
      endTime: "17:00",
    }),
    item({
      id: "all",
      date: "2026-08-24",
      time: null,
      isAllDay: true,
    }),
    item({
      id: "ritual",
      date: "2026-08-24",
      time: "18:30",
      endTime: "18:45",
    }),
  ];
  const out = filterTodayEventsAfterGrace(items, "2026-08-24", "15:00");
  assert.deepEqual(
    out.map((i) => i.id),
    ["live", "all", "ritual"]
  );
});

test("filterAblaufTimelineItems keeps first tomorrow only", () => {
  const items = [
    item({
      id: "past",
      date: "2026-08-07",
      title: "Alt",
      time: "09:00",
      endTime: "10:00",
    }),
    item({
      id: "live",
      date: "2026-08-07",
      title: "Noch",
      time: "16:00",
      endTime: "17:00",
    }),
    item({
      id: "m1",
      date: "2026-08-08",
      title: "F2 Früh",
      time: "06:30",
      endTime: "15:14",
    }),
    item({
      id: "m2",
      date: "2026-08-08",
      title: "Später",
      time: "09:00",
      endTime: "10:00",
    }),
  ];
  const out = filterAblaufTimelineItems(items, "2026-08-07", "15:00", 30);
  assert.deepEqual(
    out.map((i) => i.id),
    ["live", "m1"]
  );
});
