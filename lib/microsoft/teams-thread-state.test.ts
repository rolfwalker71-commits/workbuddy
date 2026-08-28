import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  asTeamsAnalysis,
  channelThreadKey,
  parseChannelThreadKey,
  parseTeamsInboxState,
  parseTeamsThreadKind,
} from "./teams-thread-state.ts";

test("inbox and kind parsers accept only known values", () => {
  assert.equal(parseTeamsInboxState("open"), "open");
  assert.equal(parseTeamsInboxState("later"), "later");
  assert.equal(parseTeamsInboxState("done"), "done");
  assert.equal(parseTeamsInboxState("ignored"), "ignored");
  assert.equal(parseTeamsInboxState("heute"), null);
  assert.equal(parseTeamsThreadKind("chat"), "chat");
  assert.equal(parseTeamsThreadKind("channel"), "channel");
  assert.equal(parseTeamsThreadKind("meeting"), null);
  assert.equal(channelThreadKey(" teamA ", "chan1"), "teamA:chan1");
  assert.deepEqual(parseChannelThreadKey("teamA:chan1"), {
    teamId: "teamA",
    channelId: "chan1",
  });
  assert.equal(parseChannelThreadKey("19:abc@thread.v2"), null);
});

test("asTeamsAnalysis keeps top-level tasks and cluster identity", () => {
  const parsed = asTeamsAnalysis({
    summary: "Heute zwei offene Punkte.",
    clusters: [
      {
        sourceChatId: "19:abc",
        sourceChatTitle: "Damian Schwegler",
        summary: "SAP Issue",
        tasks: [{ title: "Issue klären", dueDate: "2026-08-29" }],
        events: [],
        replies: [],
      },
    ],
    tasks: [{ title: "Issue klären", dueDate: "2026-08-29" }],
    events: [],
    replies: [],
  });
  assert.ok(parsed);
  assert.equal(parsed.summary, "Heute zwei offene Punkte.");
  assert.equal(parsed.clusters[0]?.sourceChatTitle, "Damian Schwegler");
  assert.equal(parsed.tasks[0]?.title, "Issue klären");
  assert.equal(asTeamsAnalysis({ nope: true }), null);
});

test("upsert patches inbox and keeps metadata", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-teams-inbox-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser } = await import("../users/queries.ts");
  const {
    countTeamsThreadsByInbox,
    getTeamsThreadState,
    incrementTeamsThreadApplied,
    listTeamsThreadStates,
    upsertTeamsThreadState,
  } = await import("./teams-thread-state.ts");

  const user = createAppUser({
    username: "teams-inbox",
    email: "teams-inbox@example.com",
    displayName: "Teams Inbox",
    passwordHash: "hash",
  });

  const cols = (
    (await import("../db/client.ts")).getDb()
      .prepare("PRAGMA table_info(teams_thread_state)")
      .all() as Array<{ name: string }>
  ).map((c) => c.name);
  for (const name of [
    "thread_key",
    "inbox",
    "join_url",
    "calendar_event_id",
    "issue_id",
    "applied_tasks",
    "last_analysis_json",
  ]) {
    assert.ok(cols.includes(name), `missing column ${name}`);
  }

  const created = upsertTeamsThreadState({
    userId: user.id,
    threadKey: "19:chat-damian",
    kind: "chat",
    inbox: "open",
    title: "Damian Schwegler",
    preview: "issue in SAP Business One",
    lastActiveAt: "2026-08-28T17:51:00.000Z",
    joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
    calendarEventId: "AAMk-event",
    issueId: 4711,
    lastAnalysis: {
      summary: "Eine Aufgabe.",
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
      tasks: [{ title: "Issue klären" }],
      events: [],
      replies: [],
    },
  });
  assert.equal(created.inbox, "open");
  assert.equal(created.issueId, 4711);
  assert.equal(created.joinUrl?.includes("meetup-join"), true);
  assert.equal(created.lastAnalysis?.tasks[0]?.title, "Issue klären");
  assert.equal(countTeamsThreadsByInbox(user.id, "open"), 1);

  const later = upsertTeamsThreadState({
    userId: user.id,
    threadKey: "19:chat-damian",
    inbox: "later",
  });
  assert.equal(later.inbox, "later");
  assert.equal(later.title, "Damian Schwegler");
  assert.equal(later.issueId, 4711);
  assert.equal(later.lastAnalysis?.summary, "Eine Aufgabe.");
  assert.equal(countTeamsThreadsByInbox(user.id, "open"), 0);

  const applied = incrementTeamsThreadApplied(user.id, "19:chat-damian", {
    tasks: 1,
  });
  assert.equal(applied?.appliedTasks, 1);
  assert.equal(applied?.appliedEvents, 0);
  assert.equal(applied?.inbox, "later");

  upsertTeamsThreadState({
    userId: user.id,
    threadKey: channelThreadKey("team-1", "channel-2"),
    kind: "channel",
    inbox: "done",
    title: "Support · Allgemein",
  });
  const listed = listTeamsThreadStates(user.id, { inbox: ["later", "done"] });
  assert.equal(listed.length, 2);
  assert.equal(
    listTeamsThreadStates(user.id, { q: "SAP" })[0]?.threadKey,
    "19:chat-damian"
  );
  assert.equal(getTeamsThreadState(user.id, "missing"), null);
});

test("day stamp writes analysis without wiping inbox", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-teams-stamp-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser } = await import("../users/queries.ts");
  const {
    getTeamsThreadState,
    stampTeamsDayThreads,
    upsertTeamsThreadState,
  } = await import("./teams-thread-state.ts");

  const user = createAppUser({
    username: "teams-stamp",
    email: "teams-stamp@example.com",
    displayName: "Teams Stamp",
    passwordHash: "hash",
  });

  upsertTeamsThreadState({
    userId: user.id,
    threadKey: "19:chat-anna",
    kind: "chat",
    inbox: "later",
    title: "Anna",
  });

  stampTeamsDayThreads(
    user.id,
    [
      {
        id: "19:chat-anna",
        title: "Anna Meier",
        kind: "chat",
        preview: "Bitte Offerte",
        lastActiveAt: "2026-08-28T08:00:00.000Z",
      },
    ],
    {
      summary: "Tag",
      clusters: [
        {
          sourceChatId: "19:chat-anna",
          sourceChatTitle: "Anna Meier",
          theme: "Offerte",
          summary: "Offerte offen",
          tasks: [{ title: "Offerte schicken" }],
          events: [],
          replies: [],
        },
      ],
      tasks: [{ title: "Offerte schicken" }],
      events: [],
      replies: [],
    }
  );

  const row = getTeamsThreadState(user.id, "19:chat-anna");
  assert.equal(row?.inbox, "later");
  assert.equal(row?.title, "Anna Meier");
  assert.equal(row?.preview, "Bitte Offerte");
  assert.equal(row?.lastAnalysis?.clusters[0]?.theme, "Offerte");
  assert.equal(row?.lastAnalysis?.tasks[0]?.title, "Offerte schicken");
});
