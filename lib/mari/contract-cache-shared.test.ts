import assert from "node:assert/strict";
import test from "node:test";
import {
  compareMariPositionNumbers,
  mariFlagIsTrue,
  mariPositionIsBookable,
} from "./contract-cache-shared.ts";

test("MARI kodiert wahr als -1, nicht als 1", () => {
  // Gemessen an Inactive: -1 -> 42 Verträge, 0 -> 1722, und REST /true liefert
  // exakt die mit 0. Ein `=== 1` hätte jeden Vertrag als aktiv gewertet.
  assert.equal(mariFlagIsTrue(-1), true);
  assert.equal(mariFlagIsTrue(0), false);
  assert.equal(mariFlagIsTrue("-1"), true);
  assert.equal(mariFlagIsTrue(null), false);
  assert.equal(mariFlagIsTrue(""), false);
  assert.equal(mariFlagIsTrue(true), true);
});

test("bebuchbar ist genau, was eine Leistungsnummer trägt", () => {
  assert.equal(mariPositionIsBookable("222"), true);
  assert.equal(mariPositionIsBookable(242), true);
  assert.equal(mariPositionIsBookable(""), false);
  assert.equal(mariPositionIsBookable("   "), false);
  assert.equal(mariPositionIsBookable(null), false);
  assert.equal(mariPositionIsBookable(undefined), false);
});

test("Positionsnummern sortieren nach Gliederung, nicht lexikografisch", () => {
  const input = ["10", "2", "1.10", "1.2", "1", "1.1"];
  const sorted = input.slice().sort(compareMariPositionNumbers);
  assert.deepEqual(sorted, ["1", "1.1", "1.2", "1.10", "2", "10"]);
});

test("leere und unlesbare Positionsnummern kippen die Sortierung nicht", () => {
  const input = ["2", null, "1", "abc"];
  const sorted = input.slice().sort(compareMariPositionNumbers);
  // Die beiden unbrauchbaren landen hinten, die echten bleiben in Ordnung.
  assert.deepEqual(sorted.slice(0, 2), ["1", "2"]);
  assert.equal(sorted.length, 4);
});
