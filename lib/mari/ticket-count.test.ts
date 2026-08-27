import assert from "node:assert/strict";
import test from "node:test";
import { readMariSqlCount } from "./tickets.ts";

test("readMariSqlCount accepts MARI/SQL Server alias variants", () => {
  assert.equal(readMariSqlCount({ C: 41 }), 41);
  assert.equal(readMariSqlCount({ n: 41 }), 41);
  assert.equal(readMariSqlCount({ N: 41 }), 41);
  assert.equal(readMariSqlCount({ "COUNT(*)": 41 }), 41);
  assert.equal(readMariSqlCount({}), 0);
  assert.equal(readMariSqlCount(undefined), 0);
});
