import assert from "node:assert/strict";
import test from "node:test";
import { isEnvAdminUsername } from "./resolve-user.ts";

test("isEnvAdminUsername matches default admin and env bootstrap name", () => {
  const prevUser = process.env.WORKBUDDY_USERNAME;
  const prevSecret = process.env.WORKBUDDY_SESSION_SECRET;
  const prevHash = process.env.WORKBUDDY_PASSWORD_HASH;
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";

  try {
    assert.equal(isEnvAdminUsername("admin"), true);
    assert.equal(isEnvAdminUsername("Admin"), true);
    assert.equal(isEnvAdminUsername("  admin  "), true);
    assert.equal(isEnvAdminUsername("rolf"), false);
    assert.equal(isEnvAdminUsername(""), false);
    assert.equal(isEnvAdminUsername(null), false);

    process.env.WORKBUDDY_USERNAME = "sysop";
    assert.equal(isEnvAdminUsername("sysop"), true);
    assert.equal(isEnvAdminUsername("admin"), true);
    assert.equal(isEnvAdminUsername("rolf"), false);
  } finally {
    if (prevUser === undefined) delete process.env.WORKBUDDY_USERNAME;
    else process.env.WORKBUDDY_USERNAME = prevUser;
    if (prevSecret === undefined) delete process.env.WORKBUDDY_SESSION_SECRET;
    else process.env.WORKBUDDY_SESSION_SECRET = prevSecret;
    if (prevHash === undefined) delete process.env.WORKBUDDY_PASSWORD_HASH;
    else process.env.WORKBUDDY_PASSWORD_HASH = prevHash;
  }
});
