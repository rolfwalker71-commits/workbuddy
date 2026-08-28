import assert from "node:assert/strict";
import test from "node:test";
import type { TeamsChatAnalysis } from "./analyze-teams-chat.ts";
import {
  buildTeamsInboxCards,
  inboxCardCanApply,
  inboxCardHasMeeting,
  isTeamsInboxActiveToday,
  matchesTeamsInboxFilter,
  matchesTeamsInboxQuery,
  mergeTeamsInboxThreads,
  parseChannelInboxKey,
  scopeTeamsAnalysisToThread,
  type TeamsInboxCard,
} from "./teams-inbox.ts";

const today = "2026-08-28";

const analysis: TeamsChatAnalysis = {
  summary: "Tag",
  clusters: [
    {
      sourceChatId: "19:chat-damian",
      sourceChatTitle: "Damian Schwegler",
      summary: "SAP",
      tasks: [{ title: "Issue klären" }],
      events: [],
      replies: [],
    },
  ],
  tasks: [{ title: "Issue klären", sourceChatId: "19:chat-damian" }],
  events: [],
  replies: [],
};

function card(
  partial: Partial<TeamsInboxCard> & Pick<TeamsInboxCard, "inbox" | "lastActiveAt">
): Pick<TeamsInboxCard, "inbox" | "lastActiveAt"> & { inDayScope?: boolean } {
  return partial;
}

test("Heute is active today and not ignored; done stays listed", () => {
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "open", lastActiveAt: "2026-08-28T17:51:00.000Z" }),
      "today",
      today
    ),
    true
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "done", lastActiveAt: "2026-08-28T10:00:00.000Z" }),
      "today",
      today
    ),
    true
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "later", lastActiveAt: "2026-08-28T10:00:00.000Z" }),
      "today",
      today
    ),
    true
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "ignored", lastActiveAt: "2026-08-28T10:00:00.000Z" }),
      "today",
      today
    ),
    false
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "open", lastActiveAt: "2026-08-27T10:00:00.000Z" }),
      "today",
      today
    ),
    false
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({
        inbox: "open",
        lastActiveAt: null,
        inDayScope: true,
      }),
      "today",
      today
    ),
    true
  );
});

test("Offen is open+later; Erledigt is done only", () => {
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "open", lastActiveAt: "2026-08-20T10:00:00.000Z" }),
      "open",
      today
    ),
    true
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "later", lastActiveAt: "2026-08-20T10:00:00.000Z" }),
      "open",
      today
    ),
    true
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "done", lastActiveAt: "2026-08-28T10:00:00.000Z" }),
      "open",
      today
    ),
    false
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "done", lastActiveAt: "2026-08-20T10:00:00.000Z" }),
      "done",
      today
    ),
    true
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "open", lastActiveAt: "2026-08-20T10:00:00.000Z" }),
      "done",
      today
    ),
    false
  );
  assert.equal(
    matchesTeamsInboxFilter(
      card({ inbox: "ignored", lastActiveAt: "2026-08-20T10:00:00.000Z" }),
      "open",
      today
    ),
    false
  );
});

test("day analysis stamps the matching card, not every row", () => {
  const cards = buildTeamsInboxCards({
    todayYmd: today,
    filter: "today",
    dayAnalysis: analysis,
    dayThreadKeys: ["19:chat-damian", "teamA:chan1"],
    chats: [
      {
        id: "19:chat-damian",
        title: "Damian Schwegler",
        chatType: "oneOnOne",
        lastUpdatedAt: "2026-08-28T17:51:00.000Z",
        preview: "issue in SAP",
        webUrl: null,
        joinUrl: null,
      },
      {
        id: "19:other",
        title: "Andere",
        chatType: "group",
        lastUpdatedAt: "2026-08-28T12:00:00.000Z",
        preview: "ok",
        webUrl: null,
        joinUrl: null,
      },
    ],
    channels: [
      {
        id: "chan1",
        teamId: "teamA",
        teamName: "Support",
        name: "Allgemein",
        description: null,
        webUrl: null,
      },
    ],
    threads: [
      {
        threadKey: "19:chat-damian",
        kind: "chat",
        inbox: "open",
        title: "Damian Schwegler",
        preview: "issue in SAP",
        lastActiveAt: "2026-08-28T17:51:00.000Z",
        joinUrl: null,
        calendarEventId: null,
        issueId: 4711,
        appliedTasks: 0,
        appliedEvents: 0,
        lastAnalysis: null,
      },
    ],
  });

  const damian = cards.find((c) => c.threadKey === "19:chat-damian");
  const other = cards.find((c) => c.threadKey === "19:other");
  const channel = cards.find((c) => c.threadKey === "teamA:chan1");
  assert.ok(damian);
  assert.equal(damian.analyzed, true);
  assert.equal(damian.taskCount, 1);
  assert.equal(damian.issueId, 4711);
  assert.equal(damian.lastAnalysis?.tasks[0]?.title, "Issue klären");
  assert.equal(inboxCardCanApply(damian), true);
  assert.ok(other);
  assert.equal(other.analyzed, false);
  assert.equal(other.taskCount, 0);
  assert.ok(channel);
  assert.equal(channel.title, "Support · Allgemein");
  assert.equal(channel.typeLabel, "Kanal");
});

test("done stays done in Heute; ignored drops out; reopen is a filter+action concern", () => {
  const cards = buildTeamsInboxCards({
    todayYmd: today,
    filter: "today",
    chats: [
      {
        id: "19:done-today",
        title: "Erledigt heute",
        chatType: "oneOnOne",
        lastUpdatedAt: "2026-08-28T09:00:00.000Z",
        preview: "ok",
        webUrl: null,
        joinUrl: null,
      },
      {
        id: "19:ignored-today",
        title: "Ignoriert",
        chatType: "oneOnOne",
        lastUpdatedAt: "2026-08-28T09:00:00.000Z",
        preview: "spam",
        webUrl: null,
        joinUrl: null,
      },
    ],
    channels: [],
    threads: [
      {
        threadKey: "19:done-today",
        kind: "chat",
        inbox: "done",
        title: "Erledigt heute",
        preview: "ok",
        lastActiveAt: "2026-08-28T09:00:00.000Z",
        joinUrl: null,
        calendarEventId: null,
        issueId: null,
        appliedTasks: 0,
        appliedEvents: 0,
        lastAnalysis: null,
      },
      {
        threadKey: "19:ignored-today",
        kind: "chat",
        inbox: "ignored",
        title: "Ignoriert",
        preview: "spam",
        lastActiveAt: "2026-08-28T09:00:00.000Z",
        joinUrl: null,
        calendarEventId: null,
        issueId: null,
        appliedTasks: 0,
        appliedEvents: 0,
        lastAnalysis: null,
      },
    ],
  });
  assert.deepEqual(
    cards.map((c) => c.threadKey),
    ["19:done-today"]
  );
  assert.equal(cards[0]?.inbox, "done");
});

test("scopeTeamsAnalysisToThread keeps cluster identity", () => {
  const scoped = scopeTeamsAnalysisToThread(analysis, "19:chat-damian");
  assert.equal(scoped.clusters[0]?.sourceChatTitle, "Damian Schwegler");
  assert.equal(scoped.tasks.length, 1);
  const empty = scopeTeamsAnalysisToThread(analysis, "missing");
  assert.equal(empty.clusters.length, 0);
  assert.equal(empty.tasks.length, 0);
});

test("query matches title, preview, or thread key", () => {
  const row = {
    title: "Damian Schwegler",
    preview: "issue in SAP Business One",
    threadKey: "19:chat-damian",
  };
  assert.equal(matchesTeamsInboxQuery(row, "sap"), true);
  assert.equal(matchesTeamsInboxQuery(row, "Damian"), true);
  assert.equal(matchesTeamsInboxQuery(row, "chat-damian"), true);
  assert.equal(matchesTeamsInboxQuery(row, "outlook"), false);
  assert.equal(matchesTeamsInboxQuery(row, "  "), true);
});

test("buildTeamsInboxCards applies filter plus query", () => {
  const cards = buildTeamsInboxCards({
    todayYmd: today,
    filter: "today",
    q: "SAP",
    chats: [
      {
        id: "19:chat-damian",
        title: "Damian Schwegler",
        chatType: "oneOnOne",
        lastUpdatedAt: "2026-08-28T17:51:00.000Z",
        preview: "issue in SAP",
        webUrl: null,
        joinUrl: null,
      },
      {
        id: "19:other",
        title: "Andere",
        chatType: "group",
        lastUpdatedAt: "2026-08-28T12:00:00.000Z",
        preview: "ok",
        webUrl: null,
        joinUrl: null,
      },
    ],
    channels: [],
    threads: [],
  });
  assert.deepEqual(
    cards.map((c) => c.threadKey),
    ["19:chat-damian"]
  );
});

test("meeting hint from joinUrl, calendar event, or meeting chat type", () => {
  assert.equal(
    inboxCardHasMeeting({
      joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
      calendarEventId: null,
      chatType: "oneOnOne",
    }),
    true
  );
  assert.equal(
    inboxCardHasMeeting({
      joinUrl: null,
      calendarEventId: "AAMk-event",
      chatType: null,
    }),
    true
  );
  assert.equal(
    inboxCardHasMeeting({
      joinUrl: null,
      calendarEventId: null,
      chatType: "meeting",
    }),
    true
  );
  assert.equal(
    inboxCardHasMeeting({
      joinUrl: null,
      calendarEventId: null,
      chatType: "group",
    }),
    false
  );
});

test("mergeTeamsInboxThreads overlays incoming rows", () => {
  const merged = mergeTeamsInboxThreads(
    [
      {
        threadKey: "19:a",
        kind: "chat",
        inbox: "open",
        title: "Alt",
        preview: null,
        lastActiveAt: null,
        joinUrl: null,
        calendarEventId: null,
        issueId: null,
        appliedTasks: 0,
        appliedEvents: 0,
        lastAnalysis: null,
      },
    ],
    [
      {
        threadKey: "19:a",
        kind: "chat",
        inbox: "done",
        title: "Neu",
        preview: "hi",
        lastActiveAt: "2026-08-28T10:00:00.000Z",
        joinUrl: null,
        calendarEventId: null,
        issueId: null,
        appliedTasks: 0,
        appliedEvents: 0,
        lastAnalysis: null,
      },
      {
        threadKey: "19:b",
        kind: "chat",
        inbox: "open",
        title: "Extra",
        preview: "SAP",
        lastActiveAt: null,
        joinUrl: null,
        calendarEventId: null,
        issueId: null,
        appliedTasks: 0,
        appliedEvents: 0,
        lastAnalysis: null,
      },
    ]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((t) => t.threadKey === "19:a")?.inbox, "done");
  assert.equal(merged.find((t) => t.threadKey === "19:b")?.title, "Extra");
});

test("Zurich today helper and channel key", () => {
  assert.equal(
    isTeamsInboxActiveToday("2026-08-28T22:30:00.000Z", "2026-08-29"),
    true
  );
  assert.deepEqual(parseChannelInboxKey("teamA:chan1"), {
    teamId: "teamA",
    channelId: "chan1",
  });
  assert.equal(parseChannelInboxKey("19:abc@thread.v2"), null);
});
