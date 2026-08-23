import assert from "node:assert/strict";
import test from "node:test";
import { homePathForModules, isAppModule, normalizeAppModules } from "../users/modules.ts";

test("limited user home is overview when any module is granted", () => {
  assert.equal(homePathForModules(["maringo"]), "/");
  assert.equal(homePathForModules(["microsoft", "maringo"]), "/");
  assert.equal(homePathForModules(["google"]), "/");
  assert.equal(homePathForModules([]), "/account");
});

test("microsoft, maringo and google are modules", () => {
  assert.equal(isAppModule("microsoft"), true);
  assert.equal(isAppModule("maringo"), true);
  assert.equal(isAppModule("google"), true);
  assert.equal(isAppModule("travel"), false);
  assert.deepEqual(normalizeAppModules(["travel", "maringo", "finance"]), ["maringo"]);
  assert.deepEqual(normalizeAppModules(["google", "travel"]), ["google"]);
});
