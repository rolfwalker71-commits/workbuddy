import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("company AI uses settings key, never OPENAI_API_KEY", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-co-ai-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  process.env.OPENAI_API_KEY = "sk-env-must-not-be-used";
  delete process.env.COMPANY_AI_API_KEY;
  delete process.env.COMPANY_AI_DISABLED;

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { getCompanyAiConfig, saveCompanyAiSettings } = await import(
    "./company-provider.ts"
  );

  assert.equal(getCompanyAiConfig().enabled, false);
  assert.equal(getCompanyAiConfig().apiKey, null);

  saveCompanyAiSettings({
    enabled: true,
    apiKey: "sk-company-mini",
    model: "gpt-4o-mini",
    baseUrl: "https://ai.example.com/v1",
  });
  const cfg = getCompanyAiConfig();
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.apiKey, "sk-company-mini");
  assert.notEqual(cfg.apiKey, process.env.OPENAI_API_KEY);
  assert.equal(cfg.model, "gpt-4o-mini");
  assert.equal(cfg.baseUrl, "https://ai.example.com/v1");
  assert.equal(cfg.kind, "custom");
  assert.equal(cfg.source, "settings");
});

test("official OpenAI company AI needs only key and model", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-co-ai-oai-"));
  process.env.DATABASE_PATH = path.join(tmp, "openai.sqlite");
  process.env.OPENAI_API_KEY = "sk-env-must-not-be-used";
  delete process.env.COMPANY_AI_API_KEY;
  delete process.env.COMPANY_AI_DISABLED;
  delete process.env.COMPANY_AI_KIND;
  delete process.env.COMPANY_AI_BASE_URL;

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { getCompanyAiConfig, saveCompanyAiSettings } = await import(
    "./company-provider.ts"
  );

  saveCompanyAiSettings({
    enabled: true,
    kind: "openai",
    apiKey: "sk-openai-company",
    model: "gpt-4o",
  });
  const cfg = getCompanyAiConfig();
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.kind, "openai");
  assert.equal(cfg.apiKey, "sk-openai-company");
  assert.equal(cfg.model, "gpt-4o");
  assert.equal(cfg.baseUrl, null);
});

test("COMPANY_AI_API_KEY env overrides stored key", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-co-ai-env-"));
  process.env.DATABASE_PATH = path.join(tmp, "env.sqlite");
  process.env.COMPANY_AI_API_KEY = "sk-from-env";
  process.env.COMPANY_AI_MODEL = "gpt-4o-mini";
  process.env.COMPANY_AI_BASE_URL = "https://ai.example.com/v1";
  delete process.env.COMPANY_AI_DISABLED;

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { getCompanyAiConfig } = await import("./company-provider.ts");
  const cfg = getCompanyAiConfig();
  assert.equal(cfg.source, "env");
  assert.equal(cfg.apiKey, "sk-from-env");
  assert.equal(cfg.model, "gpt-4o-mini");
  assert.equal(cfg.baseUrl, "https://ai.example.com/v1");
  delete process.env.COMPANY_AI_API_KEY;
  delete process.env.COMPANY_AI_MODEL;
  delete process.env.COMPANY_AI_BASE_URL;
});

test("Konto PUT ignores personal AI fields while company AI is on", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-co-ai-put-"));
  process.env.DATABASE_PATH = path.join(tmp, "put.sqlite");
  delete process.env.COMPANY_AI_API_KEY;
  delete process.env.COMPANY_AI_DISABLED;

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { createAppUser, updateAppUser, getUserOpenAiApiKey, getAppUserById } =
    await import("../users/queries.ts");
  const { omitPersonalAiAccountPut, saveCompanyAiSettings } = await import(
    "./company-provider.ts"
  );

  saveCompanyAiSettings({
    enabled: true,
    kind: "openai",
    apiKey: "sk-company",
    model: "gpt-4o-mini",
  });
  const user = createAppUser({
    username: "eva",
    email: "eva@example.com",
    displayName: "Eva",
    passwordHash: "hash",
  });
  updateAppUser(user.id, { openaiApiKey: "sk-personal-keep", openaiModel: "gpt-4o" });

  const put = omitPersonalAiAccountPut(
    {
      openaiApiKey: "sk-should-ignore",
      clearOpenaiApiKey: true,
      openaiModel: "gpt-4.1",
      chatProvider: "deepseek" as const,
      chatApiKey: "sk-chat-ignore",
      clearChatApiKey: true,
      chatBaseUrl: "https://ignored.example",
      chatModel: "ignored",
      mariEmployeeNumber: "M1010",
    },
    true
  );
  assert.equal("openaiApiKey" in put, false);
  assert.equal("clearOpenaiApiKey" in put, false);
  assert.equal("openaiModel" in put, false);
  assert.equal("chatProvider" in put, false);
  assert.equal("chatApiKey" in put, false);
  assert.equal("clearChatApiKey" in put, false);
  assert.equal("chatBaseUrl" in put, false);
  assert.equal("chatModel" in put, false);
  assert.equal(put.mariEmployeeNumber, "M1010");

  updateAppUser(user.id, put);
  const row = getAppUserById(user.id);
  assert.equal(getUserOpenAiApiKey(row!), "sk-personal-keep");
  assert.equal(row?.openai_model, "gpt-4o");
  assert.equal(row?.mari_employee_number, "M1010");

  const kept = omitPersonalAiAccountPut(
    { openaiApiKey: "sk-new", mariEmployeeNumber: "M2020" },
    false
  );
  assert.equal(kept.openaiApiKey, "sk-new");
});
