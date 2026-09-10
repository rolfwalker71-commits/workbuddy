import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-labels-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  const mod = await import(
    `./time-line-label-cache.ts?case=${Math.random()}`
  );
  return mod as typeof import("./time-line-label-cache.ts");
}

const FIELDS = {
  contractId: 88421,
  contractNumber: "V60007408",
  contractName: "Rinco Ultrasonics - Support Schweiz",
  contractPositionId: 1,
  contractPositionNumber: "1",
  contractPositionName: "Support",
};

test("a written line comes back, an unknown one does not", async () => {
  const cache = await loadCache();
  cache.writeTimeLineLabels([{ lineId: 404204, ...FIELDS }]);

  const hit = cache.readTimeLineLabels([404204, 999999]);
  assert.equal(hit.size, 1);
  assert.deepEqual(hit.get(404204), FIELDS);
  assert.equal(hit.get(999999), undefined);
});

test("a line without a contract is cached as such, not re-fetched forever", async () => {
  const cache = await loadCache();
  // The majority case: MARI answered, the booking simply has no contract.
  // It must be remembered, otherwise every view pays the round trip again.
  cache.writeTimeLineLabels([
    {
      lineId: 1,
      contractId: 0,
      contractNumber: null,
      contractName: null,
      contractPositionId: 0,
      contractPositionNumber: null,
      contractPositionName: null,
    },
  ]);
  const hit = cache.readTimeLineLabels([1]);
  assert.equal(hit.size, 1);
  assert.equal(hit.get(1)?.contractId, 0);
  assert.equal(hit.get(1)?.contractName, null);
});

test("entries past the TTL are treated as absent", async () => {
  const cache = await loadCache();
  const longAgo = Date.now() - cache.TIME_LINE_LABEL_TTL_MS - 60_000;
  cache.writeTimeLineLabels([{ lineId: 7, ...FIELDS }], longAgo);
  assert.equal(cache.readTimeLineLabels([7]).size, 0);
  // Written now, the same id is a hit again.
  cache.writeTimeLineLabels([{ lineId: 7, ...FIELDS }]);
  assert.equal(cache.readTimeLineLabels([7]).size, 1);
});

test("writing the same line twice updates instead of failing", async () => {
  const cache = await loadCache();
  cache.writeTimeLineLabels([{ lineId: 9, ...FIELDS }]);
  cache.writeTimeLineLabels([
    { ...FIELDS, lineId: 9, contractName: "Neuer Vertragsname" },
  ]);
  assert.equal(
    cache.readTimeLineLabels([9]).get(9)?.contractName,
    "Neuer Vertragsname"
  );
});

test("forgetting a line drops it — editing a booking must not show stale labels", async () => {
  const cache = await loadCache();
  cache.writeTimeLineLabels([{ lineId: 11, ...FIELDS }]);
  cache.forgetTimeLineLabels(11);
  assert.equal(cache.readTimeLineLabels([11]).size, 0);
});

test("invalid ids are ignored rather than written", async () => {
  const cache = await loadCache();
  cache.writeTimeLineLabels([
    { lineId: 0, ...FIELDS },
    { lineId: -3, ...FIELDS },
  ]);
  assert.equal(cache.readTimeLineLabels([0, -3]).size, 0);
  assert.equal(cache.readTimeLineLabels([]).size, 0);
});

test("more ids than one SQLite statement can bind still resolve", async () => {
  const cache = await loadCache();
  // A quarter can hold well over 400 lines; the read chunks internally.
  const ids = Array.from({ length: 950 }, (_, i) => i + 1);
  cache.writeTimeLineLabels(ids.map((lineId) => ({ lineId, ...FIELDS })));
  assert.equal(cache.readTimeLineLabels(ids).size, 950);
});
