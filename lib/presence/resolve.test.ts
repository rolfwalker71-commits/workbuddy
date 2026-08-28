import assert from "node:assert/strict";
import test from "node:test";
import {
  layersFromStored,
  resolveDayStatus,
  resolveStoredDayStatus,
  type PresenceLayer,
} from "./resolve.ts";

function layer(
  source: PresenceLayer["source"],
  status: PresenceLayer["status"] = "office"
): PresenceLayer {
  return {
    status,
    source,
    setByUserId: 1,
    note: null,
    updatedAt: "2026-08-28T10:00:00.000Z",
  };
}

test("resolveDayStatus prefers deputy over oof over self", () => {
  const deputy = layer("deputy", "sick");
  const oof = layer("oof", "absent");
  const self = layer("self", "home");
  assert.equal(resolveDayStatus({ deputy, oof, self })?.source, "deputy");
  assert.equal(resolveDayStatus({ oof, self })?.source, "oof");
  assert.equal(resolveDayStatus({ self })?.status, "home");
  assert.equal(resolveDayStatus({}), null);
});

test("unset is a gap, not silent office", () => {
  assert.equal(resolveDayStatus({ deputy: null, oof: null, self: null }), null);
  assert.equal(resolveStoredDayStatus(null), null);
});

test("layersFromStored maps a single stored row onto the winning layer", () => {
  assert.deepEqual(layersFromStored(layer("deputy", "sick")).deputy?.status, "sick");
  assert.equal(layersFromStored(layer("oof", "absent")).oof?.source, "oof");
  assert.equal(layersFromStored(layer("self", "office")).self?.status, "office");
  assert.equal(resolveStoredDayStatus(layer("deputy", "vacation"))?.status, "vacation");
});
