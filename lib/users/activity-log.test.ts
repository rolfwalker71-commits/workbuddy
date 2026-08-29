import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadStore() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-activity-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  return import("./activity-log.ts");
}

test("recordActivity writes a row; Env-Admin userId stays null", async () => {
  const { recordActivity, listActivity } = await loadStore();
  recordActivity({ username: "admin", event: "login" });
  const listed = listActivity({});
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0]?.username, "admin");
  assert.equal(listed.items[0]?.event, "login");
  assert.equal(listed.items[0]?.userId, null);
});

test("recordActivity never throws to callers", async () => {
  const { recordActivity, listActivity } = await loadStore();
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.doesNotThrow(() =>
    recordActivity({
      username: "ada",
      event: "not-an-event" as "login",
    })
  );
  assert.doesNotThrow(() =>
    recordActivity({
      username: "ada",
      event: "login",
      detail: circular,
    })
  );
  assert.equal(listActivity({}).total, 0);
});

test("listActivity newest first, event filter, mail_day_analysis is both providers", async () => {
  const { recordActivity, listActivity } = await loadStore();
  recordActivity({
    userId: 2,
    username: "ada",
    event: "login",
    createdAt: "2026-08-01T12:00:00.000Z",
  });
  recordActivity({
    userId: 2,
    username: "ada",
    event: "ticket_analysis",
    detail: { issueId: 144647, ok: true },
    createdAt: "2026-08-10T12:00:00.000Z",
  });
  recordActivity({
    userId: 2,
    username: "ada",
    event: "mail_day_analysis",
    detail: { provider: "microsoft", fromYmd: "2026-08-28", toYmd: "2026-08-29" },
    createdAt: "2026-08-20T12:00:00.000Z",
  });
  recordActivity({
    userId: 2,
    username: "ada",
    event: "mail_day_analysis",
    detail: { provider: "google", fromYmd: "2026-08-28", toYmd: "2026-08-29" },
    createdAt: "2026-08-21T12:00:00.000Z",
  });

  const all = listActivity({ event: "" });
  assert.equal(all.total, 4);
  assert.deepEqual(
    all.items.map((row) => row.event),
    [
      "mail_day_analysis",
      "mail_day_analysis",
      "ticket_analysis",
      "login",
    ]
  );

  const tickets = listActivity({ event: "ticket_analysis" });
  assert.equal(tickets.total, 1);
  assert.equal(tickets.items[0]?.detail?.issueId, 144647);

  const mailDays = listActivity({ event: "mail_day_analysis" });
  assert.equal(mailDays.total, 2);
  const providers = mailDays.items.map((row) => row.detail?.provider).sort();
  assert.deepEqual(providers, ["google", "microsoft"]);
});

test("listActivity range is inclusive on date-only from/to", async () => {
  const { recordActivity, listActivity } = await loadStore();
  recordActivity({
    username: "ada",
    event: "login",
    createdAt: "2026-08-01T12:00:00.000Z",
  });
  recordActivity({
    username: "ada",
    event: "login",
    createdAt: "2026-08-15T12:00:00.000Z",
  });
  recordActivity({
    username: "ada",
    event: "login",
    createdAt: "2026-08-28T12:00:00.000Z",
  });

  const mid = listActivity({ from: "2026-08-10", to: "2026-08-20" });
  assert.equal(mid.total, 1);
  assert.equal(mid.items[0]?.createdAt, "2026-08-15T12:00:00.000Z");

  const inclusiveEnd = listActivity({
    from: "2026-08-28",
    to: "2026-08-28",
  });
  assert.equal(inclusiveEnd.total, 1);
  assert.equal(inclusiveEnd.items[0]?.createdAt, "2026-08-28T12:00:00.000Z");
});

test("pruneOlderThan removes rows past the retention window", async () => {
  const { recordActivity, listActivity, pruneOlderThan } = await loadStore();
  const daysAgo = (days: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString();
  };
  recordActivity({
    username: "ada",
    event: "login",
    createdAt: daysAgo(61),
  });
  recordActivity({
    username: "ada",
    event: "logout",
    createdAt: daysAgo(1),
  });

  const deleted = pruneOlderThan(60);
  assert.equal(deleted, 1);
  const listed = listActivity({});
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0]?.event, "logout");
});

test("expireOpenSessions writes session_expired once and closes", async () => {
  const {
    openActivitySession,
    expireOpenSessions,
    listActivity,
  } = await loadStore();
  openActivitySession({
    sessionKey: "sess-expire",
    userId: 3,
    username: "ada",
    expiresAt: "2020-01-01T00:00:00.000Z",
  });

  const first = expireOpenSessions("2026-08-29T00:00:00.000Z");
  assert.equal(first, 1);
  const listed = listActivity({ event: "session_expired" });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0]?.username, "ada");
  assert.equal(listed.items[0]?.userId, 3);
  assert.equal(listed.items[0]?.sessionKey, "sess-expire");

  const second = expireOpenSessions("2026-08-29T00:00:00.000Z");
  assert.equal(second, 0);
  assert.equal(listActivity({ event: "session_expired" }).total, 1);
});

test("logout close does not emit session_expired", async () => {
  const {
    openActivitySession,
    closeActivitySession,
    expireOpenSessions,
    recordActivity,
    listActivity,
  } = await loadStore();
  openActivitySession({
    sessionKey: "sess-logout",
    userId: 3,
    username: "ada",
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  closeActivitySession({ sessionKey: "sess-logout" });
  recordActivity({
    userId: 3,
    username: "ada",
    event: "logout",
    sessionKey: "sess-logout",
  });

  const expired = expireOpenSessions("2026-08-29T00:00:00.000Z");
  assert.equal(expired, 0);
  assert.equal(listActivity({ event: "session_expired" }).total, 0);
  assert.equal(listActivity({ event: "logout" }).total, 1);
});
