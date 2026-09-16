import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveNotificationRecipients,
  type NotificationCandidate,
} from "./recipients.ts";
import type { AppNotifyPayload } from "../realtime/hub.ts";

const CANDIDATES: NotificationCandidate[] = [
  { ownerKey: "user:1", userId: 1, modules: ["maringo"], isAdmin: false },
  { ownerKey: "user:2", userId: 2, modules: ["microsoft"], isAdmin: false },
  { ownerKey: "user:3", userId: 3, modules: ["maringo", "microsoft"], isAdmin: true },
  { ownerKey: "admin", userId: null, modules: [], isAdmin: true },
];

function payload(patch: Partial<AppNotifyPayload> = {}): AppNotifyPayload {
  return {
    domain: "maringo",
    reason: "mari_ticket_changed",
    headline: "Maringo: 2 Ticket-Updates",
    detail: null,
    title: null,
    href: "/maringo",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "maringo",
    ...patch,
  };
}

test("an owned notification produces exactly one row", () => {
  const rows = resolveNotificationRecipients(
    payload({ ownerUserId: 2 }),
    CANDIDATES
  );
  assert.deepEqual(rows, [{ ownerKey: "user:2", userId: 2 }]);
});

test("an owned notification for an unknown user produces nothing", () => {
  const rows = resolveNotificationRecipients(
    payload({ ownerUserId: 99 }),
    CANDIDATES
  );
  assert.deepEqual(rows, []);
});

test("an unowned maringo notification skips microsoft-only users", () => {
  const rows = resolveNotificationRecipients(payload(), CANDIDATES);
  const keys = rows.map((r) => r.ownerKey);
  assert.ok(keys.includes("user:1"));
  assert.ok(!keys.includes("user:2"), "microsoft-only user must not receive it");
  // Admins sehen unbesessene Meldungen — hier gibt es keinen Besitzer, der
  // dagegen spräche.
  assert.ok(keys.includes("user:3"));
  assert.ok(keys.includes("admin"));
});

test("duplicate candidates yield one row per owner key", () => {
  const rows = resolveNotificationRecipients(payload(), [
    ...CANDIDATES,
    ...CANDIDATES,
  ]);
  assert.equal(new Set(rows.map((r) => r.ownerKey)).size, rows.length);
});

test("an empty candidate list is not an error", () => {
  assert.deepEqual(resolveNotificationRecipients(payload(), []), []);
});
