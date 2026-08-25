/**
 * Company-wide OpenAI-compatible fallback (key + model + optional base URL).
 * Stored encrypted in SQLite (Admin). Optional .env override for Docker.
 * Never reads OPENAI_API_KEY.
 */
import { getSetting, setSetting } from "@/lib/db/migrations";
import { decryptSecret, encryptSecret, secretIsSet } from "@/lib/crypto/secret-box";

export const COMPANY_AI_ENABLED_KEY = "company_ai_enabled";
export const COMPANY_AI_KEY_SETTING = "company_ai_api_key_enc";
export const COMPANY_AI_MODEL_KEY = "company_ai_model";
export const COMPANY_AI_BASE_URL_KEY = "company_ai_base_url";
export const COMPANY_AI_EMAIL_KEY = "company_ai_email";

export const DEFAULT_COMPANY_AI_MODEL = "gpt-4o-mini";

export type CompanyAiConfig = {
  enabled: boolean;
  apiKey: string | null;
  model: string;
  baseUrl: string | null;
  email: string | null;
  source: "env" | "settings" | "none";
};

export type CompanyAiPublic = {
  enabled: boolean;
  hasKey: boolean;
  model: string;
  baseUrl: string;
  email: string;
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

function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw || "").trim().toLowerCase();
  if (!v || !v.includes("@") || v.length > 200) return null;
  return v;
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
  const enabled = Boolean(apiKey) && !envDisabled && (source === "env" || storedEnabled);
  const model =
    envTrim("COMPANY_AI_MODEL") ||
    getSetting(COMPANY_AI_MODEL_KEY)?.trim() ||
    DEFAULT_COMPANY_AI_MODEL;
  const baseUrl =
    normalizeBaseUrl(envTrim("COMPANY_AI_BASE_URL")) ||
    normalizeBaseUrl(getSetting(COMPANY_AI_BASE_URL_KEY));
  const email =
    normalizeEmail(envTrim("COMPANY_AI_EMAIL")) ||
    normalizeEmail(getSetting(COMPANY_AI_EMAIL_KEY));
  return {
    enabled,
    apiKey: enabled ? apiKey : null,
    model,
    baseUrl,
    email,
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
    email: cfg.email || "",
    source: cfg.source,
  };
}

export function saveCompanyAiSettings(input: {
  enabled?: boolean;
  apiKey?: string | null;
  clearApiKey?: boolean;
  model?: string | null;
  baseUrl?: string | null;
  email?: string | null;
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
  if (input.email !== undefined) {
    setSetting(COMPANY_AI_EMAIL_KEY, normalizeEmail(input.email));
  }
  return getCompanyAiPublic();
}
