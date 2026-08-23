import assert from "node:assert/strict";
import test from "node:test";
import { HOME_PROVIDER_TIMEOUT_MS, withTimeout } from "./with-timeout.ts";

test("HOME_PROVIDER_TIMEOUT_MS stays in the 2–4s band", () => {
  assert.ok(HOME_PROVIDER_TIMEOUT_MS >= 2000);
  assert.ok(HOME_PROVIDER_TIMEOUT_MS <= 4000);
});

test("withTimeout returns the value when work finishes first", async () => {
  const value = await withTimeout(Promise.resolve(7), 50, -1);
  assert.equal(value, 7);
});

test("withTimeout returns fallback when work is slow", async () => {
  const slow = new Promise<number>((resolve) => {
    setTimeout(() => resolve(99), 80);
  });
  const value = await withTimeout(slow, 15, -1);
  assert.equal(value, -1);
});

test("withTimeout returns fallback when work rejects", async () => {
  const value = await withTimeout(Promise.reject(new Error("boom")), 50, null);
  assert.equal(value, null);
});
