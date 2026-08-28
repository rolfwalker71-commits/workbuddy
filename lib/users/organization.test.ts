import assert from "node:assert/strict";
import test from "node:test";
import {
  USER_ORGANIZATION_LABELS,
  USER_ORGANIZATIONS,
  isUserOrganization,
  parseUserOrganization,
} from "./organization.ts";

test("parseUserOrganization accepts the four ANG codes", () => {
  assert.deepEqual([...USER_ORGANIZATIONS], ["CH", "AT", "DE", "MX"]);
  assert.equal(parseUserOrganization("CH"), "CH");
  assert.equal(parseUserOrganization("AT"), "AT");
  assert.equal(parseUserOrganization("DE"), "DE");
  assert.equal(parseUserOrganization("MX"), "MX");
});

test("parseUserOrganization rejects empty and unknown values", () => {
  assert.equal(parseUserOrganization(null), null);
  assert.equal(parseUserOrganization(undefined), null);
  assert.equal(parseUserOrganization(""), null);
  assert.equal(parseUserOrganization("ch"), null);
  assert.equal(parseUserOrganization("US"), null);
  assert.equal(parseUserOrganization(0), null);
  assert.equal(isUserOrganization("CH"), true);
  assert.equal(isUserOrganization("FR"), false);
});

test("organization labels are the four ANG companies", () => {
  assert.equal(USER_ORGANIZATION_LABELS.CH, "ANG Schweiz");
  assert.equal(USER_ORGANIZATION_LABELS.AT, "ANG Österreich");
  assert.equal(USER_ORGANIZATION_LABELS.DE, "ANG Deutschland");
  assert.equal(USER_ORGANIZATION_LABELS.MX, "ANG Mexiko");
});
