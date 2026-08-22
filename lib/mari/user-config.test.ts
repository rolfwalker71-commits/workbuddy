import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("MARI config is per-user and ignores global env credentials", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-mari-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  process.env.MARI_REST_USERNAME = "global-must-not-be-used";
  process.env.MARI_REST_PASSWORD = "global-pass";
  process.env.MARI_EMPLOYEE_NUMBER = "M9999";

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser } = await import("../users/queries.ts");
  const { resolveMariConfigForUser } = await import("./settings.ts");

  const user = createAppUser({
    username: "max",
    email: "max@example.com",
    displayName: "Max",
    passwordHash: "hash",
  });
  assert.equal(resolveMariConfigForUser(user.id), null);
  assert.equal(resolveMariConfigForUser(null), null);

  updateAppUser(user.id, {
    mariRestUsername: "max.rest",
    mariRestPassword: "secret",
    mariEmployeeNumber: "M1010",
  });
  const cfg = resolveMariConfigForUser(user.id);
  assert.ok(cfg);
  assert.equal(cfg?.username, "max.rest");
  assert.equal(cfg?.password, "secret");
  assert.equal(cfg?.employeeNumber, "M1010");
  assert.notEqual(cfg?.username, process.env.MARI_REST_USERNAME);
});
