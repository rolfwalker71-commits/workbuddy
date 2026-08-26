import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseTeamsEnabled } from "./teams-prefs.ts";

test("teams preference defaults on for missing values", () => {
  assert.equal(parseTeamsEnabled(null), true);
  assert.equal(parseTeamsEnabled(undefined), true);
  assert.equal(parseTeamsEnabled(""), true);
  assert.equal(parseTeamsEnabled(1), true);
  assert.equal(parseTeamsEnabled("1"), true);
});

test("teams preference turns off only for explicit false", () => {
  assert.equal(parseTeamsEnabled(0), false);
  assert.equal(parseTeamsEnabled(false), false);
  assert.equal(parseTeamsEnabled("0"), false);
});

test("teams preference persists on the user row and defaults on", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-teams-pref-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser, getAppUserById } = await import(
    "../users/queries.ts"
  );
  const { isUserTeamsEnabled } = await import("./teams-prefs.ts");

  const user = createAppUser({
    username: "teams-pref",
    email: "teams-pref@example.com",
    displayName: "Teams Pref",
    passwordHash: "hash",
  });
  assert.equal(isUserTeamsEnabled(user.id), true);
  assert.equal(parseTeamsEnabled(getAppUserById(user.id)?.teams_enabled), true);

  updateAppUser(user.id, { teamsEnabled: false });
  assert.equal(isUserTeamsEnabled(user.id), false);
  assert.equal(getAppUserById(user.id)?.teams_enabled, 0);

  updateAppUser(user.id, { teamsEnabled: true });
  assert.equal(isUserTeamsEnabled(user.id), true);
  assert.equal(getAppUserById(user.id)?.teams_enabled, 1);
});
