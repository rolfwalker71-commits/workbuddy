import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeHomeKpis,
  mergeHomeMaringoTickets,
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
      teamsOpenCount: 4,
      teamsOpenTitle: "Damian Schwegler",
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
    ttvDuty: null,
    absence: null,
  };
  const details: HomeDetailsPayload = {
    microsoft: {
      events: [
        {
          id: "e1",
          subject: "Standup",
          date: "2026-08-23",
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
      lastTeams: {
        chatId: "c1",
        title: "Anna",
        preview: "Offerte kommt",
        lastUpdatedAt: "2026-08-23T07:10:00.000Z",
      },
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
  assert.equal(merged.microsoft?.lastTeams?.title, "Anna");
  assert.equal(merged.microsoft?.teamsOpenCount, 4);
  assert.equal(merged.microsoft?.teamsOpenTitle, "Damian Schwegler");
});

test("mergeHomeMaringoTickets updates bagel counts without dropping modules", () => {
  const overview: HomeOverviewPayload = {
    greetingName: "Rolf",
    today: "2026-08-23",
    modules: ["maringo"],
    microsoft: null,
    google: null,
    todayEvents: [],
    todayMail: [],
    maringo: {
      enabled: true,
      tickets: {
        configured: true,
        employeeNumber: "M1010",
        lastPollAt: null,
        countsByStatus: [],
        total: 0,
        recentChanges: [],
      },
    },
    weather: null,
    ttvDuty: null,
    absence: null,
  };
  const merged = mergeHomeMaringoTickets(
    overview,
    {
      configured: true,
      employeeNumber: "M1010",
      lastPollAt: "2026-08-23T16:00:00.000Z",
      countsByStatus: [{ statusId: 11, label: "Offen", count: 4 }],
      total: 4,
      recentChanges: [],
    },
    {
      savedViews: [
        { id: "v1", label: "ANG CH Support", count: 41, href: "/maringo?handledBy=M1010" },
      ],
    }
  );
  assert.equal(merged.maringo?.tickets.total, 4);
  assert.equal(merged.maringo?.tickets.countsByStatus[0]?.count, 4);
  assert.equal(merged.maringo?.savedViews?.[0]?.count, 41);
  assert.equal(merged.modules[0], "maringo");
});

test("mergeHomeKpis fills unread zeros and keeps weather if live weather missing", () => {
  const overview: HomeOverviewPayload = {
    greetingName: "Rolf",
    today: "2026-08-23",
    modules: ["microsoft", "google"],
    microsoft: {
      enabled: true,
      connected: true,
      events: [],
      mailInbox: [],
      unreadCount: 9,
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
    ttvDuty: null,
    absence: null,
    weather: {
      placeLabel: "Altdorf",
      temperatureC: 18,
      temperatureMaxC: 21,
      temperatureMinC: 12,
      weatherCode: 1,
      weatherLabelDe: "Heiter",
      icon: "sun",
      windSpeedKmh: 8,
      windDirectionDeg: 180,
      humidityPct: 60,
      week: [],
    },
  };
  const merged = mergeHomeKpis(overview, {
    microsoftUnread: 0,
    googleUnread: 3,
    weather: null,
  });
  assert.equal(merged.microsoft?.unreadCount, 0);
  assert.equal(merged.google?.unreadCount, 3);
  assert.equal(merged.weather?.placeLabel, "Altdorf");
});
