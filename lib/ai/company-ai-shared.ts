/**
 * Modell, wenn weder Company-AI noch der Benutzer eines gewählt hat.
 * Einzige Quelle für diesen Default — Client und Server hängen daran, damit
 * die Auswahl in /account und das tatsächlich benutzte Modell nicht
 * auseinanderlaufen. Preise für das Modell müssen in usage-cost.ts stehen,
 * sonst zeigt die Analyse keine Kosten mehr an.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export const DEFAULT_COMPANY_AI_MODEL = DEFAULT_OPENAI_MODEL;

export const COMPANY_OPENAI_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
] as const;

export type CompanyAiKind = "openai" | "custom";
