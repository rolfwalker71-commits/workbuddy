import assert from "node:assert/strict";
import test from "node:test";
import {
  batchRunFullySucceeded,
  batchRunPending,
  batchRunProgress,
  finishBatchRun,
  markRowBooked,
  markRowFailed,
  markRowRunning,
  startBatchRun,
} from "./batch-hours-run.ts";

test("a fresh run has everything pending", () => {
  const state = startBatchRun(["a", "b", "c"]);
  assert.equal(state.running, true);
  assert.deepEqual(batchRunPending(state), ["a", "b", "c"]);
  assert.deepEqual(batchRunProgress(state), {
    total: 3,
    finished: 0,
    booked: 0,
    failed: 0,
    percent: 0,
  });
});

test("progress counts booked and failed as finished", () => {
  let state = startBatchRun(["a", "b", "c", "d"]);
  state = markRowBooked(markRowRunning(state, "a"), "a", 11, true);
  state = markRowFailed(markRowRunning(state, "b"), "b", "Vertrag fehlt");
  const p = batchRunProgress(state);
  assert.equal(p.booked, 1);
  assert.equal(p.failed, 1);
  assert.equal(p.finished, 2);
  assert.equal(p.percent, 50);
  assert.equal(batchRunFullySucceeded(state), false);
});

test("a failed row keeps its message and stays retryable", () => {
  let state = startBatchRun(["a"]);
  state = markRowFailed(markRowRunning(state, "a"), "a", "MARI sagt nein");
  assert.equal(state.byId.a?.status, "failed");
  assert.equal(state.byId.a?.error, "MARI sagt nein");
  assert.deepEqual(batchRunPending(state), ["a"]);
});

test("a retry never resends a booked row", () => {
  let first = startBatchRun(["a", "b"]);
  first = markRowBooked(first, "a", 42, true);
  first = markRowFailed(first, "b", "Zeitüberschreitung");
  first = finishBatchRun(first);

  const second = startBatchRun(["a", "b"], first);
  assert.equal(second.byId.a?.status, "booked", "booked stays booked");
  assert.equal(second.byId.a?.lineId, 42);
  assert.equal(second.byId.b?.status, "pending", "failed row is retried");
  assert.deepEqual(batchRunPending(second), ["b"]);
});

test("a booked row that failed to stamp is still booked", () => {
  let state = startBatchRun(["a"]);
  state = markRowBooked(state, "a", 7, false, "Stempel nicht geschrieben");
  assert.equal(state.byId.a?.status, "booked");
  assert.equal(state.byId.a?.stampedDone, false);
  assert.equal(state.byId.a?.warning, "Stempel nicht geschrieben");
  assert.equal(state.byId.a?.error, null, "a warning is not a failure");
  assert.equal(batchRunFullySucceeded(state), true);
  assert.deepEqual(
    batchRunPending(state),
    [],
    "must never be sent to Maringo again"
  );
});

test("full success only when every row booked", () => {
  let state = startBatchRun(["a", "b"]);
  state = markRowBooked(state, "a", 1, true);
  assert.equal(batchRunFullySucceeded(state), false);
  state = markRowBooked(state, "b", 2, true);
  assert.equal(batchRunFullySucceeded(state), true);
  assert.equal(batchRunProgress(state).percent, 100);
});

test("an empty run is not a success", () => {
  assert.equal(batchRunFullySucceeded(startBatchRun([])), false);
});
