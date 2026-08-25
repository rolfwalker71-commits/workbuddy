import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("OpenAI resolves per user and never falls back to env", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ai-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  process.env.OPENAI_API_KEY = "sk-env-must-not-be-used";

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser } = await import("../users/queries.ts");
  const { enterAiRequestUser } = await import("./request-context.ts");
  const { getOpenAIApiKey, hasOpenAIKey, resolveUserAiConfig } = await import(
    "./client.ts"
  );

  const user = createAppUser({
    username: "anna",
    email: "anna@example.com",
    displayName: "Anna",
    passwordHash: "hash",
  });
  enterAiRequestUser(user.id);
  assert.equal(hasOpenAIKey(), false);
  assert.equal(getOpenAIApiKey(), null);
  assert.equal(resolveUserAiConfig(user.id)?.openaiApiKey, null);

  updateAppUser(user.id, { openaiApiKey: "sk-user-anna" });
  enterAiRequestUser(user.id);
  assert.equal(getOpenAIApiKey(), "sk-user-anna");
  assert.notEqual(getOpenAIApiKey(), process.env.OPENAI_API_KEY);

  enterAiRequestUser(null);
  assert.equal(getOpenAIApiKey(), null);
});

test("company AI is a fallback when the user has no personal key", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ai-co-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  process.env.OPENAI_API_KEY = "sk-env-must-not-be-used";
  delete process.env.COMPANY_AI_API_KEY;

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser } = await import("../users/queries.ts");
  const { saveCompanyAiSettings } = await import("./company-provider.ts");
  const { enterAiRequestUser } = await import("./request-context.ts");
  const { getOpenAIApiKey, hasOpenAIKey, resolveUserAiConfig } = await import(
    "./client.ts"
  );

  saveCompanyAiSettings({
    enabled: true,
    apiKey: "sk-company-mini",
    model: "gpt-4o-mini",
    email: "ki@example.com",
  });
  const user = createAppUser({
    username: "cara",
    email: "cara@example.com",
    displayName: "Cara",
    passwordHash: "hash",
  });
  enterAiRequestUser(user.id);
  assert.equal(hasOpenAIKey(), true);
  assert.equal(getOpenAIApiKey(), "sk-company-mini");
  assert.notEqual(getOpenAIApiKey(), process.env.OPENAI_API_KEY);
  assert.equal(resolveUserAiConfig(user.id)?.usingCompanyAi, true);
  assert.equal(resolveUserAiConfig(user.id)?.requestEmail, "ki@example.com");

  updateAppUser(user.id, { openaiApiKey: "sk-user-cara" });
  enterAiRequestUser(user.id);
  assert.equal(getOpenAIApiKey(), "sk-user-cara");
  assert.equal(resolveUserAiConfig(user.id)?.usingCompanyAi, false);
});

test("after-style work keeps the user key only inside runWithAiUser", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  process.env.WORKBUDDY_USERNAME = "admin";
  process.env.WORKBUDDY_PASSWORD_HASH = "scrypt:x:y";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ai-after-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser } = await import("../users/queries.ts");
  const { enterAiRequestUser, runWithAiUser } = await import(
    "./request-context.ts"
  );
  const { hasChatKey } = await import("./client.ts");

  const user = createAppUser({
    username: "berta",
    email: "berta@example.com",
    displayName: "Berta",
    passwordHash: "hash",
  });
  updateAppUser(user.id, { openaiApiKey: "sk-user-berta" });

  enterAiRequestUser(null);
  assert.equal(hasChatKey(), false);

  const seen = await runWithAiUser(user.id, async () => {
    await Promise.resolve();
    return hasChatKey();
  });
  assert.equal(seen, true);
  assert.equal(hasChatKey(), false);
});
