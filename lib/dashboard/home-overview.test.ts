import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeHomeOverviewDetails,
  type HomeDetailsPayload,
  type HomeOverviewPayload,
} from "./home-overview-shared.ts";

function emptyTasks() {
  return {
    microsoftConnected: true,
    hasMicrosoftScope: false,
    googleConnected: true,
    hasGoogleScope: false,
    items: [],
  };
}

test("mergeHomeOverviewDetails keeps unread KPIs and fills lists", () => {
  const overview: HomeOverviewPayload = {
    greetingName: "Rolf",
    today: "2026-08-23",
    modules: ["microsoft", "google"],
    microsoft: {
      enabled: true,
      connected: true,
      events: [],
      mailInbox: [],
      unreadCount: 12,
      mailDay: null,
      tasks: emptyTasks(),
    },
    google: {
      enabled: true,
      connected: true,
      events: [],
      mailInbox: [],
      unreadCount: null,
      mailDay: null,
      tasks: emptyTasks(),
    },
    todayEvents: [],
    todayMail: [],
    maringo: null,
    weather: null,
  };
  const details: HomeDetailsPayload = {
    microsoft: {
      events: [
        {
          id: "e1",
          subject: "Standup",
          startHm: "09:00",
          endHm: "09:15",
          location: null,
          isAllDay: false,
          done: false,
        },
      ],
      mailInbox: [
        {
          id: "m1",
          subject: "Hallo",
          from: "Ada",
          receivedOrSentAt: "2026-08-23T07:00:00.000Z",
          provider: "microsoft",
        },
      ],
      tasks: { ...emptyTasks(), items: [] },
    },
    google: {
      events: [],
      mailInbox: [],
      tasks: emptyTasks(),
    },
    todayEvents: [
      {
        id: "e1",
        title: "Standup",
        time: "09:00",
        planningRelevant: true,
        provider: "microsoft",
        calendarId: null,
        date: "2026-08-23",
        endTime: "09:15",
        location: null,
        isAllDay: false,
        done: false,
      },
    ],
    todayMail: [
      {
        id: "m1",
        subject: "Hallo",
        from: "Ada",
        receivedOrSentAt: "2026-08-23T07:00:00.000Z",
        provider: "microsoft",
      },
    ],
  };

  const merged = mergeHomeOverviewDetails(overview, details);
  assert.equal(merged.microsoft?.unreadCount, 12);
  assert.equal(merged.google?.unreadCount, null);
  assert.equal(merged.microsoft?.events.length, 1);
  assert.equal(merged.todayEvents[0]?.title, "Standup");
  assert.equal(merged.todayMail[0]?.subject, "Hallo");
});
