import assert from "node:assert/strict";
import { test } from "node:test";
import {
  closeoutLeadHref,
  closeoutStepsFor,
  pathMatchesStep,
} from "./steps.ts";

test("calendar step deep-links into review mode", () => {
  const calendar = closeoutStepsFor("microsoft")[0];
  assert.equal(calendar.id, "calendar");
  assert.match(calendar.href, /tab=calendar/);
  assert.match(closeoutLeadHref(calendar), /review=1/);
  assert.equal(
    pathMatchesStep("/microsoft", "?tab=calendar&review=1", calendar),
    true
  );
  assert.equal(
    pathMatchesStep("/microsoft", "?tab=calendar", calendar),
    true
  );
  assert.equal(
    pathMatchesStep("/microsoft", "?tab=mail", calendar),
    false
  );
});
