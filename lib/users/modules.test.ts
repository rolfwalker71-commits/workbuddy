import assert from "node:assert/strict";
import test from "node:test";
import {
  homePathForModules,
  isAppModule,
  normalizeAppModules,
} from "./modules.ts";

test("normalizeAppModules filters unknowns", () => {
  assert.deepEqual(
    normalizeAppModules(["microsoft", "nope", "maringo", "microsoft"]),
    ["microsoft", "maringo"]
  );
});

test("isAppModule", () => {
  assert.equal(isAppModule("travel"), false);
  assert.equal(isAppModule("microsoft"), true);
});

test("homePathForModules is overview when any module is granted", () => {
  assert.equal(homePathForModules(["maringo", "microsoft"]), "/");
  assert.equal(homePathForModules(["maringo"]), "/");
  assert.equal(homePathForModules(["microsoft"]), "/");
  assert.equal(homePathForModules([]), "/account");
});
