import assert from "node:assert/strict";
import test from "node:test";
import {
  filterVisibleMails,
  isExcludedFromMailAnalysis,
  isSystemNoiseMail,
  normalizeMailSenderEmail,
} from "./mail-threads.ts";
import {
  parseMailSenderBlacklist,
  removeMailSenderBlacklistEntry,
  upsertMailSenderBlacklistEntry,
} from "./sender-blacklist.ts";

test("normalizeMailSenderEmail lowercases and unwraps display names", () => {
  assert.equal(
    normalizeMailSenderEmail("MonitoringAlerts@AN-Group.one"),
    "monitoringalerts@an-group.one"
  );
  assert.equal(
    normalizeMailSenderEmail("System Infoboard <monitoringalerts@an-group.one>"),
    "monitoringalerts@an-group.one"
  );
  assert.equal(normalizeMailSenderEmail("kein-mail"), null);
  assert.equal(normalizeMailSenderEmail(""), null);
});

test("isSystemNoiseMail matches Infoboard and Monitoring subjects", () => {
  assert.equal(
    isSystemNoiseMail({ subject: "[SYSTEM INFOBOARD] [WARM] Host down" }),
    true
  );
  assert.equal(isSystemNoiseMail({ subject: "[Monitoring] ping" }), true);
  assert.equal(isSystemNoiseMail({ subject: "Rechnung August" }), false);
});

test("isExcludedFromMailAnalysis keeps system hide and adds user blacklist", () => {
  assert.equal(
    isExcludedFromMailAnalysis({
      subject: "[SYSTEM INFOBOARD] alert",
      fromEmail: "other@example.com",
    }),
    true
  );
  assert.equal(
    isExcludedFromMailAnalysis(
      {
        subject: "Status",
        fromEmail: "MonitoringAlerts@AN-Group.one",
      },
      { blacklistEmails: ["monitoringalerts@an-group.one"] }
    ),
    true
  );
  assert.equal(
    isExcludedFromMailAnalysis(
      { subject: "Status", fromEmail: "ok@example.com" },
      { blacklistEmails: ["monitoringalerts@an-group.one"] }
    ),
    false
  );
});

test("filterVisibleMails drops hidden senders", () => {
  const visible = filterVisibleMails(
    [
      { subject: "Hi", fromEmail: "a@example.com" },
      { subject: "[Monitoring] x", fromEmail: "a@example.com" },
      { subject: "Hi", fromEmail: "b@example.com" },
    ],
    { blacklistEmails: ["b@example.com"] }
  );
  assert.deepEqual(visible, [{ subject: "Hi", fromEmail: "a@example.com" }]);
});

test("parse and upsert blacklist entries", () => {
  const parsed = parseMailSenderBlacklist([
    { email: "B@Example.com", name: "Bee" },
    { email: "b@example.com", name: "dup" },
    "not-an-email",
  ]);
  assert.deepEqual(parsed, [{ email: "b@example.com", name: "Bee" }]);
  const added = upsertMailSenderBlacklistEntry(parsed, {
    email: "C@Example.com",
    name: "Cee",
  });
  assert.equal(added[0]?.email, "c@example.com");
  assert.deepEqual(removeMailSenderBlacklistEntry(added, "B@example.com"), [
    { email: "c@example.com", name: "Cee" },
  ]);
});
