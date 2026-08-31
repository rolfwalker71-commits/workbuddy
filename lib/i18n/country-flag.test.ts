import assert from "node:assert/strict";
import test from "node:test";
import {
  countryFlagName,
  isCountryFlagCode,
} from "./country-flag.ts";

test("isCountryFlagCode accepts org and holiday countries", () => {
  assert.equal(isCountryFlagCode("CH"), true);
  assert.equal(isCountryFlagCode("NP"), true);
  assert.equal(isCountryFlagCode("US"), false);
});

test("countryFlagName follows locale", () => {
  assert.equal(countryFlagName("CH", "de"), "Schweiz");
  assert.equal(countryFlagName("CH", "en"), "Switzerland");
  assert.equal(countryFlagName("MX", "de"), "Mexiko");
});
