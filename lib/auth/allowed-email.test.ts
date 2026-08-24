import assert from "node:assert/strict";
import test from "node:test";
import {
  companyUsernameCandidates,
  isAllowedCompanyEmail,
  normalizeLoginEmail,
} from "./allowed-email.ts";

test("only @an-group.one mailboxes are allowed by default", () => {
  assert.equal(isAllowedCompanyEmail("rolf.walker@an-group.one"), true);
  assert.equal(isAllowedCompanyEmail("Rolf.Walker@AN-GROUP.ONE"), true);
  assert.equal(isAllowedCompanyEmail("extern@gmail.com"), false);
  assert.equal(isAllowedCompanyEmail("someone@an-group.com"), false);
  assert.equal(isAllowedCompanyEmail(""), false);
  assert.equal(isAllowedCompanyEmail(null), false);
});

test("company username prefers the mailbox local part", () => {
  assert.deepEqual(companyUsernameCandidates("Rolf.Walker@an-group.one"), [
    "rolf.walker",
    "rolf.walker@an-group.one",
  ]);
  assert.equal(normalizeLoginEmail("  Ada@an-group.one "), "ada@an-group.one");
});
