import assert from "node:assert/strict";
import test from "node:test";
import {
  GRAPH_MAILBOX_CONCURRENCY,
  GRAPH_RETRY_AFTER_CAP_MS,
  isGraphThrottleStatus,
  microsoftGraphSlotSnapshot,
  parseGraphRetryAfterMs,
  resetMicrosoftGraphSlotsForTests,
  withMicrosoftGraphSlot,
} from "./graph-queue.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("429 and 503 are throttle statuses", () => {
  assert.equal(isGraphThrottleStatus(429), true);
  assert.equal(isGraphThrottleStatus(503), true);
  assert.equal(isGraphThrottleStatus(401), false);
  assert.equal(isGraphThrottleStatus(200), false);
});

test("parseGraphRetryAfterMs reads Retry-After seconds and caps", () => {
  assert.equal(
    parseGraphRetryAfterMs(new Headers({ "retry-after": "2" }), 0),
    2000
  );
  assert.equal(
    parseGraphRetryAfterMs(new Headers({ "retry-after": "60" }), 0),
    GRAPH_RETRY_AFTER_CAP_MS
  );
});

test("parseGraphRetryAfterMs prefers x-ms-retry-after-ms", () => {
  assert.equal(
    parseGraphRetryAfterMs(
      new Headers({
        "retry-after": "9",
        "x-ms-retry-after-ms": "750",
      }),
      0
    ),
    750
  );
});

test("parseGraphRetryAfterMs falls back to exponential backoff", () => {
  assert.equal(parseGraphRetryAfterMs(new Headers(), 0), 500);
  assert.equal(parseGraphRetryAfterMs(new Headers(), 1), 1000);
  assert.equal(parseGraphRetryAfterMs(new Headers(), 2), 2000);
  assert.equal(parseGraphRetryAfterMs(new Headers(), 5), GRAPH_RETRY_AFTER_CAP_MS);
});

test("withMicrosoftGraphSlot keeps at most two in-flight calls per user", async () => {
  resetMicrosoftGraphSlotsForTests();
  let current = 0;
  let peak = 0;
  const jobs = Array.from({ length: 8 }, () =>
    withMicrosoftGraphSlot(7, async () => {
      current += 1;
      peak = Math.max(peak, current);
      await sleep(15);
      current -= 1;
    })
  );
  await Promise.all(jobs);
  assert.equal(peak, GRAPH_MAILBOX_CONCURRENCY);
  assert.deepEqual(microsoftGraphSlotSnapshot(7), { inFlight: 0, waiting: 0 });
});

test("graph slots are isolated per user", async () => {
  resetMicrosoftGraphSlotsForTests();
  let peak = 0;
  let current = 0;
  const bump = async () => {
    current += 1;
    peak = Math.max(peak, current);
    await sleep(20);
    current -= 1;
  };
  await Promise.all([
    withMicrosoftGraphSlot(1, bump),
    withMicrosoftGraphSlot(1, bump),
    withMicrosoftGraphSlot(2, bump),
    withMicrosoftGraphSlot(2, bump),
  ]);
  assert.equal(peak, 4);
});

test("a thrown job still releases the graph slot", async () => {
  resetMicrosoftGraphSlotsForTests();
  await assert.rejects(
    () =>
      withMicrosoftGraphSlot(3, async () => {
        throw new Error("boom");
      }),
    /boom/
  );
  assert.deepEqual(microsoftGraphSlotSnapshot(3), { inFlight: 0, waiting: 0 });
  await withMicrosoftGraphSlot(3, async () => {
    assert.equal(microsoftGraphSlotSnapshot(3).inFlight, 1);
  });
});
