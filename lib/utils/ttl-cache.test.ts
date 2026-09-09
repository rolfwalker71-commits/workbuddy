import assert from "node:assert/strict";
import test from "node:test";
import { createTtlCache } from "./ttl-cache.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("returns a fresh value and forgets an expired one", async () => {
  const cache = createTtlCache<string>(30);
  cache.set("u5:2026-09-09", "payload");
  assert.equal(cache.get("u5:2026-09-09"), "payload");
  await wait(45);
  assert.equal(cache.get("u5:2026-09-09"), undefined);
  assert.equal(cache.size(), 0, "the expired entry is dropped on read");
});

test("a miss is undefined, not null", () => {
  const cache = createTtlCache<number>(1000);
  assert.equal(cache.get("nope"), undefined);
});

test("falsy values survive the round trip", () => {
  const cache = createTtlCache<number>(1000);
  cache.set("zero", 0);
  assert.equal(cache.get("zero"), 0, "0 must not be treated as a miss");
});

test("invalidatePrefix drops one user and keeps the others", () => {
  const cache = createTtlCache<string>(1000);
  cache.set("u5:2026-09-09", "a");
  cache.set("u5:2026-09-10", "b");
  cache.set("u7:2026-09-09", "c");
  cache.invalidatePrefix("u5:");
  assert.equal(cache.get("u5:2026-09-09"), undefined);
  assert.equal(cache.get("u5:2026-09-10"), undefined);
  assert.equal(cache.get("u7:2026-09-09"), "c");
});

test("delete removes just the one key", () => {
  const cache = createTtlCache<string>(1000);
  cache.set("a", "1");
  cache.set("b", "2");
  cache.delete("a");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "2");
});

test("stale entries are swept once the map grows", async () => {
  const cache = createTtlCache<number>(20);
  for (let i = 0; i < 70; i += 1) cache.set(`k${i}`, i);
  await wait(35);
  // The next write triggers the sweep; only the new key stays.
  cache.set("fresh", 1);
  assert.equal(cache.size(), 1);
  assert.equal(cache.get("fresh"), 1);
});

test("clear empties everything", () => {
  const cache = createTtlCache<string>(1000);
  cache.set("a", "1");
  cache.clear();
  assert.equal(cache.size(), 0);
});
