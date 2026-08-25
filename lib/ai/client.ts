import OpenAI from "openai";
import { getAiRequestUserId } from "@/lib/ai/request-context";
import { getCompanyAiConfig } from "@/lib/ai/company-provider";
import {
  getAppUserById,
  getUserChatApiKey,
  getUserOpenAiApiKey,
} from "@/lib/users/queries";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const MISSING_OPENAI_KEY_MESSAGE =
  "Hinterlege deinen OpenAI-Key unter Konto";

export type ChatProviderId = "openai" | "deepseek" | "custom";

export type UserAiConfig = {
  userId: number;
  openaiApiKey: string | null;
  openaiModel: string;
  openaiBaseUrl: string | null;
  chatProvider: ChatProviderId;
  chatApiKey: string | null;
  chatBaseUrl: string | null;
  chatModel: string;
  usingCompanyAi: boolean;
  requestEmail: string | null;
};

function normalizeBaseUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim().replace(/\/$/, "") || null;
  return trimmed;
}

function asChatProvider(raw: string | null | undefined): ChatProviderId {
  const v = (raw || "").trim().toLowerCase();
  if (v === "openai" || v === "deepseek" || v === "custom") return v;
  return "openai";
}

export function resolveUserAiConfig(
  userId: number | null | undefined
): UserAiConfig | null {
  if (userId == null || userId <= 0) return null;
  const user = getAppUserById(userId);
  if (!user) return null;
  const personalOpenai = getUserOpenAiApiKey(user);
  const company = getCompanyAiConfig();
  const usingCompanyAi = !personalOpenai && Boolean(company.enabled && company.apiKey);
  const openaiApiKey = personalOpenai || (usingCompanyAi ? company.apiKey : null);
  const chatProvider = asChatProvider(user.chat_provider);
  const storedChatKey = getUserChatApiKey(user);
  const openaiModel =
    user.openai_model?.trim() ||
    (usingCompanyAi ? company.model : null) ||
    "gpt-4o-mini";
  const openaiBaseUrl = usingCompanyAi ? company.baseUrl : null;
  const chatBaseUrl =
    chatProvider === "deepseek"
      ? normalizeBaseUrl(user.chat_base_url) || DEEPSEEK_BASE_URL
      : normalizeBaseUrl(user.chat_base_url) ||
        (usingCompanyAi ? company.baseUrl : null);
  const chatModel =
    user.chat_model?.trim() ||
    (chatProvider === "deepseek"
      ? "deepseek-v4-flash"
      : usingCompanyAi
        ? company.model
        : openaiModel);
  const chatApiKey =
    storedChatKey ||
    (chatProvider === "openai" || usingCompanyAi ? openaiApiKey : null);
  return {
    userId,
    openaiApiKey,
    openaiModel,
    openaiBaseUrl,
    chatProvider: usingCompanyAi && chatProvider === "openai" ? "custom" : chatProvider,
    chatApiKey,
    chatBaseUrl,
    chatModel,
    usingCompanyAi,
    requestEmail: usingCompanyAi ? company.email : null,
  };
}

function clientOptions(
  apiKey: string,
  baseURL: string | null | undefined,
  email: string | null | undefined
): ConstructorParameters<typeof OpenAI>[0] {
  return {
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(email
      ? { defaultHeaders: { "X-User-Email": email } }
      : {}),
    timeout: 120_000,
    maxRetries: 2,
  };
}

function currentAiConfig(): UserAiConfig | null {
  return resolveUserAiConfig(getAiRequestUserId());
}

export function getOpenAIApiKey(): string | null {
  return currentAiConfig()?.openaiApiKey || null;
}

export function getOpenAIClient(): OpenAI {
  const cfg = currentAiConfig();
  const apiKey = cfg?.openaiApiKey || null;
  if (!apiKey) {
    throw new Error(MISSING_OPENAI_KEY_MESSAGE);
  }
  return new OpenAI(
    clientOptions(apiKey, cfg?.openaiBaseUrl, cfg?.requestEmail)
  );
}

export function getOpenAIModel(): string {
  return currentAiConfig()?.openaiModel || "gpt-4o-mini";
}

export function hasOpenAIKey(): boolean {
  return Boolean(getOpenAIApiKey());
}

export function getChatProvider(): ChatProviderId {
  return currentAiConfig()?.chatProvider || "openai";
}

export function getChatBaseUrl(): string | null {
  const cfg = currentAiConfig();
  if (!cfg || cfg.chatProvider === "openai") return null;
  return cfg.chatBaseUrl;
}

export function getChatApiKey(): string | null {
  return currentAiConfig()?.chatApiKey || null;
}

export function getChatModel(): string {
  return currentAiConfig()?.chatModel || "gpt-4o-mini";
}

export function getChatClient(): OpenAI {
  const cfg = currentAiConfig();
  const apiKey = cfg?.chatApiKey || null;
  if (!apiKey) {
    throw new Error(MISSING_OPENAI_KEY_MESSAGE);
  }
  return new OpenAI(
    clientOptions(apiKey, cfg?.chatBaseUrl, cfg?.requestEmail)
  );
}

export function hasChatKey(): boolean {
  return Boolean(getChatApiKey());
}

export function getDeepSeekMailApiKey(): string | null {
  const cfg = currentAiConfig();
  if (!cfg) return null;
  if (cfg.chatProvider === "deepseek" || cfg.chatProvider === "custom") {
    return cfg.chatApiKey;
  }
  return null;
}

export function hasDeepSeekMailKey(): boolean {
  return Boolean(getDeepSeekMailApiKey());
}

export function getDeepSeekMailModel(): string {
  const cfg = currentAiConfig();
  if (cfg?.chatModel?.toLowerCase().includes("deepseek")) return cfg.chatModel;
  return "deepseek-v4-flash";
}

export function getDeepSeekMailClient(): OpenAI {
  const cfg = currentAiConfig();
  const apiKey = getDeepSeekMailApiKey();
  if (!apiKey) {
    throw new Error(
      "Optionalen Chat-Key (DeepSeek/Custom) unter Konto hinterlegen — oder den OpenAI-Key für Compose nutzen."
    );
  }
  const baseURL = cfg?.chatBaseUrl || DEEPSEEK_BASE_URL;
  return new OpenAI(clientOptions(apiKey, baseURL, cfg?.requestEmail));
}

export function getDeepSeekMailJsonExtras(): Record<string, unknown> {
  return { thinking: { type: "disabled" } };
}

export function getChatJsonRequestExtras(): Record<string, unknown> {
  if (getChatProvider() !== "deepseek") return {};
  return { thinking: { type: "disabled" } };
}

export function getAnalysisClient(options?: {
  needsVision?: boolean;
}): { client: OpenAI; model: string; provider: "openai" | "chat" } {
  if (options?.needsVision) {
    return {
      client: getOpenAIClient(),
      model: getOpenAIModel(),
      provider: "openai",
    };
  }
  return {
    client: getChatClient(),
    model: getChatModel(),
    provider: "chat",
  };
}

export function getOpenAIBaseUrl(): string | null {
  return getChatBaseUrl();
}
