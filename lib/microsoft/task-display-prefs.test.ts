import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultMsTaskDisplayPrefs,
  parseMsTaskDisplayPrefs,
} from "./task-display-prefs.ts";

test("task display prefs default both on", () => {
  assert.deepEqual(defaultMsTaskDisplayPrefs(), { todo: true, planner: true });
});

test("task display prefs parse allows turning one source off", () => {
  assert.deepEqual(parseMsTaskDisplayPrefs({ todo: false }), {
    todo: false,
    planner: true,
  });
  assert.deepEqual(parseMsTaskDisplayPrefs({ planner: false, todo: true }), {
    todo: true,
    planner: false,
  });
});
