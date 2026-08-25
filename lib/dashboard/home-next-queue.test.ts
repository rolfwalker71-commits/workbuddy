import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeNextQueue } from "./home-next-queue.ts";
import type { WorkspaceTodayEvent } from "../workspace/merge-today.ts";

function ev(
  partial: Partial<WorkspaceTodayEvent> & Pick<WorkspaceTodayEvent, "id" | "title">
): WorkspaceTodayEvent {
  return {
    time: "14:00",
    planningRelevant: true,
    provider: "microsoft",
    calendarId: null,
    date: "2026-08-25",
    endTime: "14:45",
    location: null,
    isAllDay: false,
    done: false,
    ...partial,
  };
}

test("soon stamped meeting ranks above overdue ticket", () => {
  const items = buildHomeNextQueue({
    nowYmd: "2026-08-25",
    nowHm: "13:20",
    events: [
      ev({
        id: "m1",
        title: "Bübchen SQL",
        mari: {
          issueId: 4821,
          stampStatus: "pending",
          hours: 0.75,
          cardCode: "C00421",
          briefDescription: "Bübchen SQL",
          status: 11,
          statusName: "NEU",
        },
      }),
    ],
    tickets: [
      {
        issueId: 4711,
        briefDescription: "HANA Trace",
        dueDate: "2026-08-20",
        status: 1,
        statusName: "Offen",
        cardCode: "C1",
        addressMatchcode: "HANA",
        overdue: true,
      },
    ],
    pendingStamps: [],
    tasks: [],
    ttvInboxCount: 6,
    iAmTtv: false,
  });
  assert.equal(items[0]?.kind, "event-soon");
  assert.equal(items[1]?.kind, "ticket-overdue");
  assert.equal(items.some((i) => i.kind === "ttv-inbox"), true);
  const ttv = items.find((i) => i.kind === "ttv-inbox");
  assert.match(ttv?.detail || "", /Fallback-Filter/);
  assert.equal(ttv?.href, "/maringo?filter=ttv");
});

test("TTV duty hint ranks higher than fallback inbox", () => {
  const asDuty = buildHomeNextQueue({
    nowYmd: "2026-08-25",
    nowHm: "09:00",
    events: [],
    tickets: [],
    pendingStamps: [],
    tasks: [],
    ttvInboxCount: 3,
    iAmTtv: true,
  });
  const asFallback = buildHomeNextQueue({
    nowYmd: "2026-08-25",
    nowHm: "09:00",
    events: [],
    tickets: [],
    pendingStamps: [],
    tasks: [],
    ttvInboxCount: 3,
    iAmTtv: false,
  });
  assert.ok((asDuty[0]?.rank ?? 99) < (asFallback[0]?.rank ?? 0));
  assert.doesNotMatch(asDuty[0]?.detail || "", /Fallback/);
});

test("pending stamp after meeting becomes hours item", () => {
  const items = buildHomeNextQueue({
    nowYmd: "2026-08-25",
    nowHm: "12:00",
    events: [],
    tickets: [],
    pendingStamps: [
      {
        eventId: "e1",
        issueId: 10,
        title: "Review",
        eventDate: "2026-08-25",
        startHm: "11:00",
        endHm: "11:30",
        hours: 0.5,
        cardCode: null,
        briefDescription: "Review",
      },
    ],
    tasks: [],
    ttvInboxCount: 0,
    iAmTtv: false,
  });
  assert.equal(items[0]?.kind, "hours-pending");
  assert.equal(items[0]?.href, "/maringo?open=10&book=1");
});
