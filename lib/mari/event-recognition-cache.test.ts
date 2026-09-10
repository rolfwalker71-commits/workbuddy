import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-recog-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  return (await import(
    `./event-recognition-cache.ts?case=${Math.random()}`
  )) as typeof import("./event-recognition-cache.ts");
}

const BOOKING = {
  cardCode: "C1471",
  customerName: "Rinco Ultrasonics",
  projectNumber: "P600074",
  projectLabel: "Rinco Holding / Ultrasonics (P600074)",
  contractId: 88421,
  contractVisible: "V60007408",
  source: "guess" as const,
  meetingKind: "mixed" as const,
  contractOptional: false,
};

test("the key ignores case, padding and attendee order", async () => {
  const c = await loadCache();
  const a = c.eventRecognitionKey("  Daily Morning Call ", ["B@x.ch", "a@X.ch"]);
  const b = c.eventRecognitionKey("daily morning call", ["a@x.ch", "b@x.ch"]);
  assert.equal(a, b);
  // A duplicate attendee must not produce a different key either.
  assert.equal(
    c.eventRecognitionKey("Call", ["a@x.ch", "a@x.ch"]),
    c.eventRecognitionKey("Call", ["a@x.ch"])
  );
});

test("a different title or a different attendee is a different key", async () => {
  const c = await loadCache();
  const base = c.eventRecognitionKey("Call", ["a@x.ch"]);
  assert.notEqual(c.eventRecognitionKey("Call 2", ["a@x.ch"]), base);
  assert.notEqual(c.eventRecognitionKey("Call", ["b@x.ch"]), base);
  assert.notEqual(c.eventRecognitionKey("Call", []), base);
});

test("a recognised booking round-trips", async () => {
  const c = await loadCache();
  const key = c.eventRecognitionKey("Ticket Review (RINCO)", []);
  c.writeEventRecognition(key, "Ticket Review (RINCO)", BOOKING);
  assert.deepEqual(c.readEventRecognition(key), { booking: BOOKING });
});

test("«nothing recognised» is remembered, not re-asked", async () => {
  const c = await loadCache();
  const key = c.eventRecognitionKey("MorgenCall", []);
  c.writeEventRecognition(key, "MorgenCall", null);
  // A miss and a cached null must be distinguishable, or the most common case
  // would pay the lookup on every single open.
  assert.deepEqual(c.readEventRecognition(key), { booking: null });
  assert.equal(c.readEventRecognition("never-written"), null);
});

test("entries past the TTL count as a miss", async () => {
  const c = await loadCache();
  const key = c.eventRecognitionKey("Infra Intern", []);
  const longAgo = Date.now() - c.EVENT_RECOGNITION_TTL_MS - 60_000;
  c.writeEventRecognition(key, "Infra Intern", BOOKING, longAgo);
  assert.equal(c.readEventRecognition(key), null);
  c.writeEventRecognition(key, "Infra Intern", BOOKING);
  assert.deepEqual(c.readEventRecognition(key)?.booking, BOOKING);
});

test("re-recognising the same title overwrites the old answer", async () => {
  const c = await loadCache();
  const key = c.eventRecognitionKey("Infra Intern", []);
  c.writeEventRecognition(key, "Infra Intern", BOOKING);
  c.writeEventRecognition(key, "Infra Intern", {
    ...BOOKING,
    projectNumber: "P300052",
  });
  assert.equal(c.readEventRecognition(key)?.booking?.projectNumber, "P300052");
});

test("a corrupt row behaves like a miss", async () => {
  const c = await loadCache();
  const key = c.eventRecognitionKey("Broken", []);
  c.writeEventRecognition(key, "Broken", BOOKING);
  const { getDb } = (await import(
    `../db/client.ts?case=${Math.random()}`
  )) as typeof import("../db/client.ts");
  getDb()
    .prepare(`UPDATE mari_event_recognition SET booking_json = ? WHERE cache_key = ?`)
    .run("{not json", key);
  assert.equal(c.readEventRecognition(key), null);
});

test("clearing empties the cache and reports how much went", async () => {
  const c = await loadCache();
  // The db connection is cached on first import, so cases share one file —
  // start from a known-empty table rather than from whatever ran before.
  c.clearEventRecognitionCache();
  for (const title of ["a", "b", "c"]) {
    c.writeEventRecognition(c.eventRecognitionKey(title, []), title, null);
  }
  assert.equal(c.clearEventRecognitionCache(), 3);
  assert.equal(c.readEventRecognition(c.eventRecognitionKey("a", [])), null);
});

test("an empty key is neither written nor read", async () => {
  const c = await loadCache();
  c.writeEventRecognition("", "x", BOOKING);
  assert.equal(c.readEventRecognition(""), null);
});
