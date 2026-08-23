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
        id: "g1",
        title: "Standup",
        provider: "google",
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
    ["m1", "g1", "buddy-day-close", "m2"]
  );
  const ritual = merged.find((e) => e.id === "buddy-day-close");
  assert.equal(ritual?.time, "18:30");
  assert.equal(ritual?.provider, "buddy");
  assert.equal(ritual?.calendarId, "buddy-ritual");
});

test("mergeWorkspaceTodayEvents keeps ritual on a single-provider list", () => {
  const merged = mergeWorkspaceTodayEvents([
    ev({
      id: "g1",
      title: "Review",
      provider: "google",
      time: "11:00",
      isAllDay: false,
    }),
  ]);
  assert.deepEqual(
    merged.map((e) => e.provider),
    ["google", "buddy"]
  );
  assert.ok(!merged.some((e) => e.provider === "microsoft"));
});

test("mergeWorkspaceTodayEvents omits ritual on weekends", () => {
  const merged = mergeWorkspaceTodayEvents([
    ev({
      id: "x",
      title: "Weekend",
      provider: "google",
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
    provider: "google",
    calendarId: "primary",
    date: "2026-08-24",
    planningRelevant: false,
  });
  assert.equal(event.id, "abc");
  assert.equal(event.title, "Review");
  assert.equal(event.time, "14:00");
  assert.equal(event.planningRelevant, false);
  assert.equal(event.provider, "google");
  assert.equal(workspaceEventKey(event), "google:primary:abc");
});

test("mergeWorkspaceMailSamples sorts newest first and keeps provider", () => {
  const merged = mergeWorkspaceMailSamples(
    [
      {
        id: "g",
        subject: "Gmail",
        from: "a@g",
        receivedOrSentAt: "2026-08-24T08:00:00.000Z",
        provider: "google",
      },
    ],
    [
      {
        id: "m",
        subject: "Outlook",
        from: "b@m",
        receivedOrSentAt: "2026-08-24T10:00:00.000Z",
        provider: "microsoft",
      },
    ]
  );
  assert.deepEqual(
    merged.map((m) => m.provider),
    ["microsoft", "google"]
  );
});
