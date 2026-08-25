import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecommendedStatusId } from "./status.ts";

test("resolveRecommendedStatusId prefers a known statusId", () => {
  assert.equal(
    resolveRecommendedStatusId({ statusId: 6, label: "Offen" }),
    6
  );
  assert.equal(resolveRecommendedStatusId({ statusId: 99 }), null);
  assert.equal(resolveRecommendedStatusId(null), null);
});

test("resolveRecommendedStatusId maps labels when id is missing", () => {
  assert.equal(
    resolveRecommendedStatusId({ statusId: null, label: "In Arbeit" }),
    3
  );
  assert.equal(
    resolveRecommendedStatusId({ label: "Warte auf den Kunden" }),
    6
  );
  assert.equal(resolveRecommendedStatusId({ label: "unbekannt" }), null);
});
