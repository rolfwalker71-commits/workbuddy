import assert from "node:assert/strict";
import test from "node:test";
import {
  batchHoursDraftKey,
  isValidBatchDraftYmd,
  parseBatchDraftDay,
  pruneBatchDraftDay,
  type PersistedBatchDay,
} from "./batch-hours-store.ts";

test("key is per user and day", () => {
  assert.equal(batchHoursDraftKey(5, "2026-09-09"), "batch_hours_draft_u5_2026-09-09");
});

test("only real dates are accepted", () => {
  assert.equal(isValidBatchDraftYmd("2026-09-09"), true);
  assert.equal(isValidBatchDraftYmd("09.09.2026"), false);
  assert.equal(isValidBatchDraftYmd(""), false);
});

test("garbage in the blob yields an empty day", () => {
  assert.deepEqual(parseBatchDraftDay(null), {});
  assert.deepEqual(parseBatchDraftDay(""), {});
  assert.deepEqual(parseBatchDraftDay("not json"), {});
  assert.deepEqual(parseBatchDraftDay("[1,2,3]"), {});
  assert.deepEqual(parseBatchDraftDay('{"ev":42}'), {});
});

test("a stored row round-trips with its editable fields", () => {
  const day = parseBatchDraftDay(
    JSON.stringify({
      "ev-1": {
        projectNumber: "P103763",
        projectLabel: "P103763 Rinco",
        contractId: 55,
        contractVisible: "V103763",
        contractPositionId: 3,
        activity: "Server einrichten",
        memoText: "Zweiter Teil",
        hoursRaw: "1,5",
        hoursBillableRaw: "0",
        billableDirty: true,
        internalRemarkVerr: "Rueckfrage",
        zeroHoursReason: "Kulanz",
      },
    })
  );
  const row = day["ev-1"];
  assert.ok(row);
  assert.equal(row.projectNumber, "P103763");
  assert.equal(row.contractId, 55);
  assert.equal(row.contractPositionId, 3);
  assert.equal(row.hoursRaw, "1,5", "raw input is kept verbatim");
  assert.equal(row.hoursBillableRaw, "0");
  assert.equal(row.billableDirty, true);
  assert.equal(row.zeroHoursReason, "Kulanz");
});

test("unknown and malformed fields fall back instead of throwing", () => {
  const day = parseBatchDraftDay(
    JSON.stringify({
      "ev-1": {
        projectNumber: 123,
        contractId: "nope",
        contractPositionId: -4,
        activity: null,
        billableDirty: "yes",
        somethingElse: true,
      },
    })
  );
  const row = day["ev-1"];
  assert.ok(row);
  assert.equal(row.projectNumber, null);
  assert.equal(row.contractId, null);
  assert.equal(row.contractPositionId, null);
  assert.equal(row.activity, "");
  assert.equal(row.billableDirty, false, "only a real true counts");
});

test("pruning keeps only rows still in the day", () => {
  const day: PersistedBatchDay = parseBatchDraftDay(
    JSON.stringify({
      keep: { activity: "a" },
      gone: { activity: "b" },
    })
  );
  const pruned = pruneBatchDraftDay(day, ["keep", "never-seen"]);
  assert.deepEqual(Object.keys(pruned), ["keep"]);
});
