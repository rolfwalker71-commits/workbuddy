import assert from "node:assert/strict";
import test from "node:test";
import {
  isMariTimeoutError,
  mariStatusSuggestsStaleAuth,
  missingSqlTableFromMessage,
  sqlTargetsTable,
} from "@/lib/mari/client";

test("a missing table is recognised from the HANA error", () => {
  // The schema varies between MARI installations, so several lookups probe a
  // list of candidate tables. Remembering the misses turned booking
  // recognition from 3-6s per appointment into a few hundred ms.
  assert.equal(
    missingSqlTableFromMessage(
      "clsRecordsetHana.OpenRecordsetADO: ERROR [42S02] [SAP AG][HDBODBC] Base table or view not found;259 invalid table name: Could not find table/view OCRD in schema MARI_PROJEKTANG: line 1 col 93"
    ),
    "OCRD"
  );
  assert.equal(missingSqlTableFromMessage("An error has occurred."), null);
  assert.equal(missingSqlTableFromMessage(""), null);
});

test("only FROM/JOIN targets count as touching a missing table", () => {
  const missing = new Set(["OCRD", "MARIPROJECT"]);
  assert.equal(
    sqlTargetsTable('SELECT "CardCode" FROM "OCRD" WHERE x = 1', missing),
    "OCRD"
  );
  assert.equal(
    sqlTargetsTable(
      'SELECT a."x" FROM "MARIProjectTimeKeepingLines" a JOIN "OCRD" c ON 1=1',
      missing
    ),
    "OCRD"
  );
  assert.equal(
    sqlTargetsTable('SELECT p."x" FROM "MARIProject" p', missing),
    "MARIProject"
  );
  // A column may share a table's name — that must not block the query.
  assert.equal(
    sqlTargetsTable('SELECT "OCRD" FROM "MARIProjectTimeKeepingLines"', missing),
    null
  );
  // A table whose name merely contains a missing one is a different table.
  assert.equal(
    sqlTargetsTable('SELECT 1 FROM "MARIProjectTimeKeepingLines"', missing),
    null
  );
  assert.equal(sqlTargetsTable('SELECT 1 FROM "OCRD"', new Set()), null);
});

test("an aborted request is a timeout, not a stale session", () => {
  // The distinction matters: a stale session buys a ~2s re-login, a timeout
  // must fail fast because every other call is queued behind it.
  assert.equal(isMariTimeoutError(new DOMException("x", "TimeoutError")), true);
  assert.equal(isMariTimeoutError(new DOMException("x", "AbortError")), true);
  assert.equal(isMariTimeoutError(new TypeError("fetch failed")), false);
  assert.equal(isMariTimeoutError(new Error("ECONNRESET")), false);
  assert.equal(isMariTimeoutError(null), false);
  assert.equal(isMariTimeoutError("TimeoutError"), false);
});

test("mariStatusSuggestsStaleAuth covers opaque MARI failures", () => {
  assert.equal(mariStatusSuggestsStaleAuth(401), true);
  assert.equal(mariStatusSuggestsStaleAuth(403), true);
  assert.equal(mariStatusSuggestsStaleAuth(500), true);
  assert.equal(mariStatusSuggestsStaleAuth(502), true);
  assert.equal(mariStatusSuggestsStaleAuth(503), true);
  assert.equal(mariStatusSuggestsStaleAuth(400), false);
  assert.equal(mariStatusSuggestsStaleAuth(404), false);
  assert.equal(mariStatusSuggestsStaleAuth(200), false);
});
