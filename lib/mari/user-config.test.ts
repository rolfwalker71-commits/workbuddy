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

  const { getMariSettingsPublic } = await import("./settings.ts");
  const pub = getMariSettingsPublic(user.id);
  assert.equal(pub.mariConfigured, true);
  assert.equal(pub.hasMariPassword, true);
  assert.equal(pub.mariPasswordUnreadable, false);
});

test("MARI ALS enterWith after await is lost; run() keeps the user", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-mari-als-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser } = await import("../users/queries.ts");
  const {
    enterMariRequestUser,
    runWithMariUser,
  } = await import("./request-context.ts");
  const { resolveMariConfig } = await import("./settings.ts");

  const user = createAppUser({
    username: "als",
    email: "als@example.com",
    displayName: "Als",
    passwordHash: "hash",
  });
  updateAppUser(user.id, {
    mariRestUsername: "rwa",
    mariRestPassword: "secret",
    mariEmployeeNumber: "M1010",
  });

  await (async () => {
    await Promise.resolve();
    enterMariRequestUser(user.id);
  })();
  assert.equal(
    resolveMariConfig(),
    null,
    "enterWith after await must not leak into the caller"
  );

  const cfg = await runWithMariUser(user.id, async () => {
    await Promise.resolve();
    return resolveMariConfig();
  });
  assert.ok(cfg);
  assert.equal(cfg?.username, "rwa");
  assert.equal(cfg?.employeeNumber, "M1010");
});

test("decrypt-fail is unreadable, not silently missing or configured", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  delete process.env.DATA_ENCRYPTION_KEY;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-mari-dec-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser, getAppUserById } = await import(
    "../users/queries.ts"
  );
  const { resolveMariConfigForUser, getMariSettingsPublic } = await import(
    "./settings.ts"
  );

  const user = createAppUser({
    username: "key",
    email: "key@example.com",
    displayName: "Key",
    passwordHash: "hash",
  });
  updateAppUser(user.id, {
    mariRestUsername: "rwa",
    mariRestPassword: "secret",
    mariEmployeeNumber: "M1010",
  });
  assert.ok(resolveMariConfigForUser(user.id));
  const enc = getAppUserById(user.id)?.mari_rest_password_enc;
  assert.ok(enc?.startsWith("wb1:"));

  process.env.DATA_ENCRYPTION_KEY =
    "a-different-encryption-key-with-more-than-32-chars";
  assert.equal(resolveMariConfigForUser(user.id), null);

  const pub = getMariSettingsPublic(user.id);
  assert.equal(pub.mariConfigured, false);
  assert.equal(pub.hasMariPassword, false);
  assert.equal(pub.mariPasswordUnreadable, true);
  assert.equal(pub.mariUsername, "rwa");
  assert.equal(pub.mariEmployeeNumber, "M1010");
});
