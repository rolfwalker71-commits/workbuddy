import assert from "node:assert/strict";
import test from "node:test";
import { isClaimableYmd, weekRangeFrom } from "./ttv-duty-shared.ts";

test("isClaimableYmd allows today and tomorrow", () => {
  assert.equal(isClaimableYmd("2026-08-25", "2026-08-25"), true);
  assert.equal(isClaimableYmd("2026-08-26", "2026-08-25"), true);
  assert.equal(isClaimableYmd("2026-08-27", "2026-08-25"), false);
  assert.equal(isClaimableYmd("nope", "2026-08-25"), false);
});

test("weekRangeFrom starts on Monday", () => {
  const week = weekRangeFrom("2026-08-25");
  assert.equal(week.fromYmd, "2026-08-24");
  assert.equal(week.toYmd, "2026-08-30");
});
