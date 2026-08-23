import assert from "node:assert/strict";
import test from "node:test";
import { parseGmailExcerptHeaders, parseGmailUnreadCount } from "./mail-inbox";

test("parseGmailUnreadCount reads INBOX messagesUnread", () => {
  assert.equal(parseGmailUnreadCount({ messagesUnread: 23 }), 23);
  assert.equal(parseGmailUnreadCount({ messagesUnread: 0 }), 0);
  assert.equal(parseGmailUnreadCount({ messagesUnread: -4 }), 0);
  assert.equal(parseGmailUnreadCount({ messagesUnread: null }), null);
  assert.equal(parseGmailUnreadCount({}), null);
  assert.equal(parseGmailUnreadCount({ messagesUnread: Number.NaN }), null);
});

test("parseGmailExcerptHeaders uses metadata headers only", () => {
  const row = parseGmailExcerptHeaders(
    "m1",
    [
      { name: "Subject", value: "Rechnung" },
      { name: "From", value: '"Ada" <ada@example.com>' },
    ],
    "1710000000000"
  );
  assert.equal(row.id, "m1");
  assert.equal(row.subject, "Rechnung");
  assert.equal(row.from, "Ada");
  assert.equal(row.receivedOrSentAt, new Date(1710000000000).toISOString());
});
