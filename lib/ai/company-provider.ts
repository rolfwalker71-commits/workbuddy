/**
 * Company-wide AI: official OpenAI (key + model) or a custom OpenAI-compatible URL.
 * Leading for every user when enabled. Personal Konto keys apply only if this is off.
 * Stored encrypted in SQLite (Admin). Optional .env override for Docker.
 * Never reads OPENAI_API_KEY.
 */
import { getSetting, setSetting } from "@/lib/db/migrations";
import { decryptSecret, encryptSecret, secretIsSet } from "@/lib/crypto/secret-box";
import {
  DEFAULT_COMPANY_AI_MODEL,
  type CompanyAiKind,
} from "@/lib/ai/company-ai-shared";

export {
  COMPANY_OPENAI_MODELS,
  DEFAULT_COMPANY_AI_MODEL,
  type CompanyAiKind,
} from "@/lib/ai/company-ai-shared";

export const COMPANY_AI_ENABLED_KEY = "company_ai_enabled";
export const COMPANY_AI_KIND_KEY = "company_ai_kind";
export const COMPANY_AI_KEY_SETTING = "company_ai_api_key_enc";
export const COMPANY_AI_MODEL_KEY = "company_ai_model";
export const COMPANY_AI_BASE_URL_KEY = "company_ai_base_url";

export type CompanyAiConfig = {
  enabled: boolean;
  kind: CompanyAiKind;
  apiKey: string | null;
  model: string;
  baseUrl: string | null;
  source: "env" | "settings" | "none";
};

export type CompanyAiPublic = {
  enabled: boolean;
  kind: CompanyAiKind;
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

function asKind(raw: string | null | undefined): CompanyAiKind | null {
  const v = (raw || "").trim().toLowerCase();
  if (v === "openai" || v === "custom") return v;
  return null;
}

function settingsKey(): string | null {
  return decryptSecret(getSetting(COMPANY_AI_KEY_SETTING));
}

function resolveKind(
  storedUrl: string | null
): CompanyAiKind {
  const fromEnv = asKind(envTrim("COMPANY_AI_KIND"));
  if (fromEnv) return fromEnv;
  const fromSettings = asKind(getSetting(COMPANY_AI_KIND_KEY));
  if (fromSettings) return fromSettings;
  return storedUrl ? "custom" : "openai";
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
  const storedUrl =
    normalizeBaseUrl(envTrim("COMPANY_AI_BASE_URL")) ||
    normalizeBaseUrl(getSetting(COMPANY_AI_BASE_URL_KEY));
  const kind = resolveKind(storedUrl);
  const baseUrl = kind === "custom" ? storedUrl : null;
  const hasCredentials =
    kind === "custom" ? Boolean(apiKey && model && baseUrl) : Boolean(apiKey && model);
  const enabled =
    hasCredentials && !envDisabled && (source === "env" || storedEnabled);
  return {
    enabled,
    kind,
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
    kind: cfg.kind,
    hasKey: Boolean(cfg.apiKey) || secretIsSet(getSetting(COMPANY_AI_KEY_SETTING)),
    model: cfg.model,
    baseUrl: cfg.baseUrl || "",
    source: cfg.source,
  };
}

export function saveCompanyAiSettings(input: {
  enabled?: boolean;
  kind?: CompanyAiKind;
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
  if (input.kind !== undefined) {
    setSetting(COMPANY_AI_KIND_KEY, input.kind);
    if (input.kind === "openai") {
      setSetting(COMPANY_AI_BASE_URL_KEY, null);
    }
  }
  if (input.baseUrl !== undefined && input.kind !== "openai") {
    const url = normalizeBaseUrl(input.baseUrl);
    setSetting(COMPANY_AI_BASE_URL_KEY, url);
    if (input.kind === undefined) {
      setSetting(COMPANY_AI_KIND_KEY, url ? "custom" : "openai");
    }
  }
  return getCompanyAiPublic();
}
