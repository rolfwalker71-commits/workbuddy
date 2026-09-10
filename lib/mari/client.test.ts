import assert from "node:assert/strict";
import test from "node:test";
import {
  isMariTimeoutError,
  mariStatusSuggestsStaleAuth,
} from "@/lib/mari/client";

test("an aborted request is a timeout, not a stale session", () => {
  // The distinction matters: a stale session buys a ~2s re-login, a timeout
  // must fail fast because every other call is queued behind it.
  assert.equal(isMariTimeoutError(new DOMException("x", "TimeoutError")), true);
  assert.equal(isMariTimeoutError(new DOMException("x", "AbortError")), true);
  assert.equal(isMariTimeoutError(new TypeError("fetch failed")), false);
  assert.equal(isMariTimeoutError(new Error("ECONNRESET")), false);
  assert.equal(isMariTimeoutError(null), false);
  assert.equal(isMariTimeoutError("TimeoutError"), false);
});

test("mariStatusSuggestsStaleAuth covers opaque MARI failures", () => {
  assert.equal(mariStatusSuggestsStaleAuth(401), true);
  assert.equal(mariStatusSuggestsStaleAuth(403), true);
  assert.equal(mariStatusSuggestsStaleAuth(500), true);
  assert.equal(mariStatusSuggestsStaleAuth(502), true);
  assert.equal(mariStatusSuggestsStaleAuth(503), true);
  assert.equal(mariStatusSuggestsStaleAuth(400), false);
  assert.equal(mariStatusSuggestsStaleAuth(404), false);
  assert.equal(mariStatusSuggestsStaleAuth(200), false);
});
