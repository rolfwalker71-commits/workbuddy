import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeWorkspaceMailSamples,
  mergeWorkspaceTodayEvents,
  toWorkspaceTodayEvent,
  workspaceEventKey,
  type WorkspaceTodayEvent,
} from "./merge-today.ts";

function ev(
  partial: Partial<WorkspaceTodayEvent> &
    Pick<WorkspaceTodayEvent, "id" | "title" | "provider">
): WorkspaceTodayEvent {
  return {
    time: null,
    planningRelevant: true,
    calendarId: null,
    date: "2026-08-24",
    endTime: null,
    location: null,
    isAllDay: !partial.time,
    ...partial,
  };
}

test("mergeWorkspaceTodayEvents sorts by time then title", () => {
  const merged = mergeWorkspaceTodayEvents(
    [
      ev({
        id: "m3",
        title: "Standup",
        provider: "microsoft",
        time: "09:30",
        isAllDay: false,
      }),
    ],
    [
      ev({
        id: "m1",
        title: "Früh",
        provider: "microsoft",
        time: "08:00",
        isAllDay: false,
      }),
      ev({
        id: "m2",
        title: "Ganztägig",
        provider: "microsoft",
        time: null,
        isAllDay: true,
      }),
    ]
  );
  assert.deepEqual(
    merged.map((e) => e.id),
    ["m1", "m3", "buddy-day-close", "m2"]
  );
  const ritual = merged.find((e) => e.id === "buddy-day-close");
  assert.equal(ritual?.time, "18:30");
  assert.equal(ritual?.provider, "buddy");
  assert.equal(ritual?.calendarId, "buddy-ritual");
});

test("mergeWorkspaceTodayEvents appends the ritual to a Microsoft list", () => {
  const merged = mergeWorkspaceTodayEvents([
    ev({
      id: "m1",
      title: "Review",
      provider: "microsoft",
      time: "11:00",
      isAllDay: false,
    }),
  ]);
  assert.deepEqual(
    merged.map((e) => e.provider),
    ["microsoft", "buddy"]
  );
});

test("mergeWorkspaceTodayEvents omits ritual on weekends", () => {
  const merged = mergeWorkspaceTodayEvents([
    ev({
      id: "x",
      title: "Weekend",
      provider: "microsoft",
      date: "2026-08-23",
      time: "10:00",
      isAllDay: false,
    }),
  ]);
  assert.ok(!merged.some((e) => e.id === "buddy-day-close"));
});

test("toWorkspaceTodayEvent keeps ritual-ready id/title/time/planningRelevant", () => {
  const event = toWorkspaceTodayEvent({
    id: "abc",
    summary: "Review",
    startHm: "14:00",
    endHm: "14:30",
    provider: "microsoft",
    calendarId: "primary",
    date: "2026-08-24",
    planningRelevant: false,
  });
  assert.equal(event.id, "abc");
  assert.equal(event.title, "Review");
  assert.equal(event.time, "14:00");
  assert.equal(event.planningRelevant, false);
  assert.equal(event.provider, "microsoft");
  assert.equal(workspaceEventKey(event), "microsoft:primary:abc");
});

test("mergeWorkspaceMailSamples sorts newest first across groups", () => {
  const merged = mergeWorkspaceMailSamples(
    [
      {
        id: "old",
        subject: "Älter",
        from: "a@m",
        receivedOrSentAt: "2026-08-24T08:00:00.000Z",
        provider: "microsoft",
      },
    ],
    [
      {
        id: "new",
        subject: "Neuer",
        from: "b@m",
        receivedOrSentAt: "2026-08-24T10:00:00.000Z",
        provider: "microsoft",
      },
    ]
  );
  assert.deepEqual(
    merged.map((m) => m.id),
    ["new", "old"]
  );
});
