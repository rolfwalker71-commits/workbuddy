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
    email: "ki@an-group.one",
  });
  const cfg = getCompanyAiConfig();
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.apiKey, "sk-company-mini");
  assert.notEqual(cfg.apiKey, process.env.OPENAI_API_KEY);
  assert.equal(cfg.model, "gpt-4o-mini");
  assert.equal(cfg.email, "ki@an-group.one");
  assert.equal(cfg.source, "settings");
});

test("COMPANY_AI_API_KEY env overrides stored key", async () => {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-co-ai-env-"));
  process.env.DATABASE_PATH = path.join(tmp, "env.sqlite");
  process.env.COMPANY_AI_API_KEY = "sk-from-env";
  process.env.COMPANY_AI_MODEL = "gpt-4o-mini";
  delete process.env.COMPANY_AI_DISABLED;

  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const { getCompanyAiConfig } = await import("./company-provider.ts");
  const cfg = getCompanyAiConfig();
  assert.equal(cfg.source, "env");
  assert.equal(cfg.apiKey, "sk-from-env");
  assert.equal(cfg.model, "gpt-4o-mini");
  delete process.env.COMPANY_AI_API_KEY;
  delete process.env.COMPANY_AI_MODEL;
});
