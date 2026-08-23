import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_MODULES,
  homePathForModules,
  isAppModule,
  normalizeAppModules,
} from "./modules.ts";

test("normalizeAppModules filters unknowns", () => {
  assert.deepEqual(
    normalizeAppModules(["microsoft", "nope", "maringo", "google", "microsoft"]),
    ["microsoft", "maringo", "google"]
  );
});

test("isAppModule", () => {
  assert.equal(isAppModule("travel"), false);
  assert.equal(isAppModule("microsoft"), true);
  assert.equal(isAppModule("google"), true);
});

test("APP_MODULES includes google", () => {
  assert.ok(APP_MODULES.includes("google"));
});

test("homePathForModules is overview when any module is granted", () => {
  assert.equal(homePathForModules(["maringo", "microsoft"]), "/");
  assert.equal(homePathForModules(["maringo"]), "/");
  assert.equal(homePathForModules(["microsoft"]), "/");
  assert.equal(homePathForModules(["google"]), "/");
  assert.equal(homePathForModules([]), "/account");
});
