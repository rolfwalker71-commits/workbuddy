import assert from "node:assert/strict";
import test from "node:test";
import { createLane } from "./lane.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("never runs more than the limit at once", async () => {
  const lane = createLane(2);
  let running = 0;
  let peak = 0;
  const gate = deferred();
  const tasks = Array.from({ length: 6 }, () =>
    lane.run(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    })
  );
  // Nothing can finish yet, so the peak is whatever the lane admitted.
  await Promise.resolve();
  assert.equal(peak, 2);
  gate.resolve();
  await Promise.all(tasks);
  assert.equal(peak, 2);
  assert.equal(lane.active, 0);
  assert.equal(lane.waiting, 0);
});

test("a limit of one serialises completely", async () => {
  const lane = createLane(1);
  const order: number[] = [];
  await Promise.all(
    [1, 2, 3].map((n) =>
      lane.run(async () => {
        order.push(n);
        await new Promise((r) => setTimeout(r, 5));
        order.push(-n);
      })
    )
  );
  // Interleaving would show as 1,2,-1,… — strict pairs prove serial execution.
  assert.deepEqual(order, [1, -1, 2, -2, 3, -3]);
});

test("a throwing task frees its slot", async () => {
  const lane = createLane(1);
  await assert.rejects(
    lane.run(async () => {
      throw new Error("boom");
    }),
    /boom/
  );
  assert.equal(lane.active, 0);
  // The lane still works afterwards — a leaked slot would deadlock here.
  assert.equal(await lane.run(async () => "ok"), "ok");
  assert.equal(lane.active, 0);
});

test("queued tasks keep FIFO order", async () => {
  const lane = createLane(1);
  const seen: string[] = [];
  const tasks = ["a", "b", "c", "d"].map((id) =>
    lane.run(async () => {
      seen.push(id);
    })
  );
  await Promise.all(tasks);
  assert.deepEqual(seen, ["a", "b", "c", "d"]);
});

test("a nonsense limit still admits one", async () => {
  for (const limit of [0, -3, Number.NaN]) {
    const lane = createLane(limit);
    assert.equal(await lane.run(async () => 42), 42);
    assert.equal(lane.active, 0);
  }
});
