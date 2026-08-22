import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Microsoft OAuth tokens are stored per userId key", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-oauth-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { readMicrosoftUserTokens, saveMicrosoftUserTokens } = await import(
    "../microsoft/oauth.ts"
  );

  saveMicrosoftUserTokens(4, {
    refreshToken: "refresh-4",
    email: "a@contoso.com",
    updatedAt: new Date().toISOString(),
  });
  saveMicrosoftUserTokens(9, {
    refreshToken: "refresh-9",
    email: "b@contoso.com",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(readMicrosoftUserTokens(4)?.refreshToken, "refresh-4");
  assert.equal(readMicrosoftUserTokens(9)?.refreshToken, "refresh-9");
  assert.equal(readMicrosoftUserTokens(1), null);
});
