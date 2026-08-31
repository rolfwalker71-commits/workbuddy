import assert from "node:assert/strict";
import test from "node:test";
import {
  companyFromMariIssue,
  formatMariCompanyLabel,
  mergeMariCompanyOptions,
  parseMariCompanyId,
} from "@/lib/mari/companies-shared";

test("parseMariCompanyId accepts positive ints", () => {
  assert.equal(parseMariCompanyId(1), 1);
  assert.equal(parseMariCompanyId("2"), 2);
  assert.equal(parseMariCompanyId(0), null);
  assert.equal(parseMariCompanyId("x"), null);
  assert.equal(parseMariCompanyId(null), null);
});

test("companyFromMariIssue reads REST Company", () => {
  assert.equal(companyFromMariIssue({ Company: 3 }), 3);
  assert.equal(companyFromMariIssue({ company: "1" }), 1);
  assert.equal(companyFromMariIssue({}), null);
});

test("formatMariCompanyLabel shows name and id", () => {
  assert.equal(formatMariCompanyLabel(1, "AN Group"), "AN Group (1)");
  assert.equal(formatMariCompanyLabel(2, null), "Mandant 2");
});

test("mergeMariCompanyOptions unions mandants and prefers named rows", () => {
  const merged = mergeMariCompanyOptions([
    [{ id: 1, name: "AN Group" }],
    [{ id: 1, name: "Mandant 1" }, { id: 2, name: "Mandant 2" }],
    [{ id: 3, name: "IWT" }],
  ]);
  assert.deepEqual(merged, [
    { id: 1, name: "AN Group" },
    { id: 2, name: "Mandant 2" },
    { id: 3, name: "IWT" },
  ]);
});
