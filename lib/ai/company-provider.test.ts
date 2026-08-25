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
