export const DEFAULT_COMPANY_AI_MODEL = "gpt-4o-mini";

export const COMPANY_OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
] as const;

export type CompanyAiKind = "openai" | "custom";
