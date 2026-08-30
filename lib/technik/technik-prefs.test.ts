import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("technik nav defaults on and can be turned off per user", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-technik-pref-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser } = await import("../users/queries.ts");
  const {
    isTechnikNavEnabled,
    setTechnikNavEnabled,
  } = await import("./technik-prefs.ts");

  const user = createAppUser({
    username: "technik-pref",
    email: "technik-pref@example.com",
    passwordHash: "x",
    displayName: "Technik Pref",
  });

  assert.equal(isTechnikNavEnabled(user.id), true);
  assert.equal(isTechnikNavEnabled(null), true);
  setTechnikNavEnabled(user.id, false);
  assert.equal(isTechnikNavEnabled(user.id), false);
  setTechnikNavEnabled(user.id, true);
  assert.equal(isTechnikNavEnabled(user.id), true);
});
