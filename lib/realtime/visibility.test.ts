import assert from "node:assert/strict";
import test from "node:test";
import { notificationVisibleTo, type NotifyViewer } from "./visibility.ts";
import { ALL_NOTIFY_REASONS } from "./reason-catalog.ts";
import { ownerMayReceive } from "../push/owner-filter.ts";
import type { AppNotifyPayload } from "./hub.ts";

function viewer(patch: Partial<NotifyViewer> = {}): NotifyViewer {
  return { userId: 7, modules: ["maringo", "microsoft"], isAdmin: false, ...patch };
}

function payload(patch: Partial<AppNotifyPayload> = {}): AppNotifyPayload {
  return {
    domain: "maringo",
    reason: "mari_ticket_changed",
    headline: "Maringo: 2 Ticket-Updates",
    detail: "#4711 Status: Offen → In Arbeit",
    title: null,
    href: "/maringo",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "maringo",
    ...patch,
  };
}

test("an owned notification reaches only its owner", () => {
  const n = payload({ ownerUserId: 7 });
  assert.equal(notificationVisibleTo(n, viewer({ userId: 7 })), true);
  assert.equal(notificationVisibleTo(n, viewer({ userId: 8 })), false);
});

test("admins do not get to read other people's owned notifications", () => {
  // Der Push-Pfad hat Admins noch nie durchgelassen; liefen SSE und Push hier
  // auseinander, bekäme der Admin einen Toast ohne Push.
  const n = payload({ ownerUserId: 7 });
  assert.equal(
    notificationVisibleTo(n, viewer({ userId: 99, isAdmin: true })),
    false
  );
});

test("the env admin (userId null) never matches an owned notification", () => {
  const n = payload({ ownerUserId: 7 });
  assert.equal(
    notificationVisibleTo(n, viewer({ userId: null, isAdmin: true })),
    false
  );
});

test("ownerKey alone scopes the notification when ownerUserId is missing", () => {
  const n = payload({ ownerUserId: null, ownerKey: "user:3" });
  assert.equal(notificationVisibleTo(n, viewer({ userId: 3 })), true);
  assert.equal(notificationVisibleTo(n, viewer({ userId: 7 })), false);
});

test("an admin-keyed notification reaches admins only", () => {
  const n = payload({ ownerUserId: null, ownerKey: "admin" });
  assert.equal(
    notificationVisibleTo(n, viewer({ userId: null, isAdmin: true })),
    true
  );
  assert.equal(notificationVisibleTo(n, viewer({ isAdmin: false })), false);
});

test("an unowned notification falls back to module visibility", () => {
  const n = payload({ ownerUserId: null, reason: "microsoft_mail_day" });
  assert.equal(
    notificationVisibleTo(n, viewer({ modules: ["microsoft"] })),
    true
  );
  assert.equal(
    notificationVisibleTo(n, viewer({ modules: ["maringo"] })),
    false
  );
  assert.equal(
    notificationVisibleTo(n, viewer({ modules: [], isAdmin: true })),
    true
  );
});

test("SSE visibility and push owner filtering agree on owned notifications", () => {
  // Beide Wege müssen dieselbe Antwort geben, sonst kommt eine Meldung nur auf
  // einem Kanal an.
  for (const reason of ALL_NOTIFY_REASONS) {
    const n = payload({ reason, ownerUserId: 7 });
    assert.equal(
      notificationVisibleTo(n, viewer({ userId: 7 })),
      ownerMayReceive("user:7", n),
      `reason ${reason} must agree for the owner`
    );
    assert.equal(
      notificationVisibleTo(n, viewer({ userId: 8 })),
      ownerMayReceive("user:8", n),
      `reason ${reason} must agree for a stranger`
    );
  }
});
