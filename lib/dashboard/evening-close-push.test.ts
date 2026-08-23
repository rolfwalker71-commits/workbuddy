import assert from "node:assert/strict";
import test from "node:test";
import { inEveningCloseWindow } from "./evening-close-push.ts";

test("evening close window is 18:30–19:30 Zurich", () => {
  assert.equal(inEveningCloseWindow(18, 29), false);
  assert.equal(inEveningCloseWindow(18, 30), true);
  assert.equal(inEveningCloseWindow(19, 0), true);
  assert.equal(inEveningCloseWindow(19, 29), true);
  assert.equal(inEveningCloseWindow(19, 30), false);
  assert.equal(inEveningCloseWindow(7, 30), false);
});
