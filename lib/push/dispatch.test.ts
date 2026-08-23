import assert from "node:assert/strict";
import test from "node:test";
import { ownerMayReceive } from "./owner-filter.ts";
import type { AppNotifyPayload } from "../realtime/hub.ts";

function note(
  partial: Partial<AppNotifyPayload> = {}
): AppNotifyPayload {
  return {
    domain: "app",
    reason: "evening_digest",
    headline: "Tagesabschluss",
    detail: null,
    title: null,
    href: "/",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "workbuddy",
    ...partial,
  };
}

test("ownerMayReceive honors ownerUserId (not admin-all)", () => {
  const n = note({ ownerUserId: 7 });
  assert.equal(ownerMayReceive("user:7", n), true);
  assert.equal(ownerMayReceive("user:8", n), false);
  assert.equal(ownerMayReceive("admin", n), false);
});

test("ownerMayReceive without ownerUserId allows any valid owner key", () => {
  const n = note({ ownerUserId: null });
  assert.equal(ownerMayReceive("user:1", n), true);
  assert.equal(ownerMayReceive("admin", n), true);
  assert.equal(ownerMayReceive("nope", n), false);
});
