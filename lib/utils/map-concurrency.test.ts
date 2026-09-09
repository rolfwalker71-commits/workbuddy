import assert from "node:assert/strict";
import test from "node:test";
import { mapWithConcurrency } from "./map-concurrency.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

test("keeps input order regardless of completion order", async () => {
  const out = await mapWithConcurrency([30, 5, 20, 1], 2, async (ms) => {
    await new Promise((r) => setTimeout(r, ms));
    return ms;
  });
  assert.deepEqual(out, [30, 5, 20, 1]);
});

test("never exceeds the limit and still runs in parallel", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight -= 1;
  });
  assert.equal(peak, 3);
});

test("a limit above the item count spawns no idle workers", async () => {
  let peak = 0;
  let inFlight = 0;
  await mapWithConcurrency([1, 2], 10, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight -= 1;
  });
  assert.equal(peak, 2);
});

test("empty input does no work", async () => {
  let calls = 0;
  const out = await mapWithConcurrency([], 4, async () => {
    calls += 1;
  });
  assert.deepEqual(out, []);
  assert.equal(calls, 0);
});

test("a rejection propagates", async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/
  );
});
