/**
 * Company-wide OpenAI-compatible provider: API key, model, and base URL.
 * Leading for every user when enabled. Personal Konto keys apply only if this is off.
 * Stored encrypted in SQLite (Admin). Optional .env override for Docker.
 * Never reads OPENAI_API_KEY.
 */
import { getSetting, setSetting } from "@/lib/db/migrations";
import { decryptSecret, encryptSecret, secretIsSet } from "@/lib/crypto/secret-box";

export const COMPANY_AI_ENABLED_KEY = "company_ai_enabled";
export const COMPANY_AI_KEY_SETTING = "company_ai_api_key_enc";
export const COMPANY_AI_MODEL_KEY = "company_ai_model";
export const COMPANY_AI_BASE_URL_KEY = "company_ai_base_url";

export const DEFAULT_COMPANY_AI_MODEL = "gpt-4o-mini";

export type CompanyAiConfig = {
  enabled: boolean;
  apiKey: string | null;
  model: string;
  baseUrl: string | null;
  source: "env" | "settings" | "none";
};

export type CompanyAiPublic = {
  enabled: boolean;
  hasKey: boolean;
  model: string;
  baseUrl: string;
  source: CompanyAiConfig["source"];
};

function envTrim(name: string): string | null {
  const v = process.env[name]?.trim() || "";
  return v || null;
}

function normalizeBaseUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim().replace(/\/$/, "") || null;
  return trimmed;
}

function settingsKey(): string | null {
  return decryptSecret(getSetting(COMPANY_AI_KEY_SETTING));
}

export function getCompanyAiConfig(): CompanyAiConfig {
  const envKey = envTrim("COMPANY_AI_API_KEY");
  const storedKey = settingsKey();
  const apiKey = envKey || storedKey;
  const source: CompanyAiConfig["source"] = envKey
    ? "env"
    : storedKey
      ? "settings"
      : "none";
  const envDisabled = envTrim("COMPANY_AI_DISABLED") === "1";
  const storedEnabled = getSetting(COMPANY_AI_ENABLED_KEY) !== "0";
  const model =
    envTrim("COMPANY_AI_MODEL") ||
    getSetting(COMPANY_AI_MODEL_KEY)?.trim() ||
    DEFAULT_COMPANY_AI_MODEL;
  const baseUrl =
    normalizeBaseUrl(envTrim("COMPANY_AI_BASE_URL")) ||
    normalizeBaseUrl(getSetting(COMPANY_AI_BASE_URL_KEY));
  const enabled =
    Boolean(apiKey && model && baseUrl) &&
    !envDisabled &&
    (source === "env" || storedEnabled);
  return {
    enabled,
    apiKey: enabled ? apiKey : null,
    model,
    baseUrl,
    source,
  };
}

export function getCompanyAiPublic(): CompanyAiPublic {
  const cfg = getCompanyAiConfig();
  return {
    enabled: cfg.enabled,
    hasKey: Boolean(cfg.apiKey) || secretIsSet(getSetting(COMPANY_AI_KEY_SETTING)),
    model: cfg.model,
    baseUrl: cfg.baseUrl || "",
    source: cfg.source,
  };
}

export function saveCompanyAiSettings(input: {
  enabled?: boolean;
  apiKey?: string | null;
  clearApiKey?: boolean;
  model?: string | null;
  baseUrl?: string | null;
}): CompanyAiPublic {
  if (input.enabled !== undefined) {
    setSetting(COMPANY_AI_ENABLED_KEY, input.enabled ? "1" : "0");
  }
  if (input.clearApiKey) {
    setSetting(COMPANY_AI_KEY_SETTING, null);
  } else if (input.apiKey != null && input.apiKey.trim()) {
    setSetting(COMPANY_AI_KEY_SETTING, encryptSecret(input.apiKey.trim()));
  }
  if (input.model !== undefined) {
    setSetting(COMPANY_AI_MODEL_KEY, input.model?.trim() || DEFAULT_COMPANY_AI_MODEL);
  }
  if (input.baseUrl !== undefined) {
    setSetting(COMPANY_AI_BASE_URL_KEY, normalizeBaseUrl(input.baseUrl));
  }
  return getCompanyAiPublic();
}
