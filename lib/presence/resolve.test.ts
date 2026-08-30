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

test("resolveDayStatus prefers deputy over vacationCal over oof over self over default", () => {
  const deputy = layer("deputy", "sick");
  const vacationCal = layer("vacationCal", "vacation");
  const oof = layer("oof", "absent");
  const self = layer("self", "home");
  const fallback = layer("default", "office");
  assert.equal(
    resolveDayStatus({ deputy, vacationCal, oof, self, default: fallback })
      ?.source,
    "deputy"
  );
  assert.equal(
    resolveDayStatus({ vacationCal, oof, self, default: fallback })?.source,
    "vacationCal"
  );
  assert.equal(resolveDayStatus({ oof, self, default: fallback })?.source, "oof");
  assert.equal(resolveDayStatus({ self, default: fallback })?.source, "self");
  assert.equal(resolveDayStatus({ default: fallback })?.status, "office");
  assert.equal(resolveDayStatus({}), null);
});

test("unset is a gap, not silent office", () => {
  assert.equal(
    resolveDayStatus({ deputy: null, oof: null, self: null, default: null }),
    null
  );
  assert.equal(resolveStoredDayStatus(null), null);
});

test("layersFromStored maps a single stored row onto the winning layer", () => {
  assert.deepEqual(layersFromStored(layer("deputy", "sick")).deputy?.status, "sick");
  assert.equal(layersFromStored(layer("oof", "absent")).oof?.source, "oof");
  assert.equal(
    layersFromStored(layer("vacationCal", "vacation")).vacationCal?.status,
    "vacation"
  );
  assert.equal(layersFromStored(layer("self", "office")).self?.status, "office");
  assert.equal(resolveStoredDayStatus(layer("deputy", "vacation"))?.status, "vacation");
});
