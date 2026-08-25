import assert from "node:assert/strict";
import test from "node:test";
import { isAbsentOn } from "./absence-shared.ts";

test("isAbsentOn is inclusive", () => {
  const range = { fromYmd: "2026-08-24", toYmd: "2026-08-26" };
  assert.equal(isAbsentOn(range, "2026-08-23"), false);
  assert.equal(isAbsentOn(range, "2026-08-24"), true);
  assert.equal(isAbsentOn(range, "2026-08-25"), true);
  assert.equal(isAbsentOn(range, "2026-08-26"), true);
  assert.equal(isAbsentOn(range, "2026-08-27"), false);
});
