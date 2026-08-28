import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildTeamsApplyNotes,
  collectTeamsApplyThreadKeys,
  inferTeamsThreadKind,
  teamsApplyHasWork,
  teamsApplyPrimaryConflict,
} from "./teams-apply.ts";

test("one primary action: to-do or event, not both", () => {
  assert.equal(teamsApplyPrimaryConflict([{ title: "A" }], []), null);
  assert.equal(teamsApplyPrimaryConflict([], [{ title: "B" }]), null);
  assert.equal(
    teamsApplyPrimaryConflict([{ title: "A" }], [{ title: "B" }]),
    "Eine primäre Aktion: To-do oder Termin, nicht beides."
  );
  assert.equal(teamsApplyHasWork({ tasks: [], events: [], issueId: 4711 }), true);
  assert.equal(teamsApplyHasWork({ tasks: [], events: [] }), false);
});

test("notes include Quelle Teams and optional #issueId", () => {
  assert.equal(
    buildTeamsApplyNotes({
      notes: "Nachfassen",
      sourceChatTitle: "Damian Schwegler",
      issueId: 4711,
    }),
    [
      "Nachfassen",
      "Quelle Teams: Damian Schwegler",
      "#4711",
      "Übernommen aus Teams-Analyse (Buddy)",
    ].join("\n\n")
  );
  assert.match(
    buildTeamsApplyNotes({ sourceChatTitle: null }),
    /^Quelle Teams\n\n/
  );
});

test("infer chat vs channel thread keys", () => {
  assert.equal(inferTeamsThreadKind("19:chat-damian@thread.v2"), "chat");
  assert.equal(
    inferTeamsThreadKind("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:19:channel"),
    "channel"
  );
  assert.equal(inferTeamsThreadKind("x", "channel"), "channel");
});

test("collect thread keys from body and item sources", () => {
  assert.deepEqual(
    collectTeamsApplyThreadKeys({
      tasks: [{ title: "A", sourceChatId: "19:a" }],
      events: [],
      threadKey: "19:fallback",
    }),
    ["19:fallback", "19:a"]
  );
});

test("record apply increments counters and keeps last_analysis_json", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-teams-apply-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser } = await import("../users/queries.ts");
  const { upsertTeamsThreadState } = await import("./teams-thread-state.ts");
  const { recordTeamsApplyOnThread } = await import("./teams-apply.ts");

  const user = createAppUser({
    username: "teams-apply",
    email: "teams-apply@example.com",
    displayName: "Teams Apply",
    passwordHash: "hash",
  });

  upsertTeamsThreadState({
    userId: user.id,
    threadKey: "19:chat-damian",
    kind: "chat",
    inbox: "open",
    title: "Damian Schwegler",
    issueId: null,
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

  const applied = recordTeamsApplyOnThread({
    userId: user.id,
    threadKey: "19:chat-damian",
    issueId: 4711,
    tasks: 1,
  });
  assert.equal(applied?.appliedTasks, 1);
  assert.equal(applied?.appliedEvents, 0);
  assert.equal(applied?.issueId, 4711);
  assert.equal(applied?.lastAnalysis?.summary, "Eine Aufgabe.");
  assert.equal(applied?.inbox, "open");
});
