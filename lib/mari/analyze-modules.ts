/**
 * Optional product/module hints for ticket analysis.
 * Client-safe — no OpenAI / db / Node-only imports.
 */

export const MARI_ANALYZE_MODULE_IDS = [
  "sap-b1-sql",
  "sap-b1-hana",
  "coresuite",
  "boyum-beas",
  "boyum-b1up",
  "ang",
  "sql-server",
  "linux",
  "hana",
] as const;

export type MariAnalyzeModuleId = (typeof MARI_ANALYZE_MODULE_IDS)[number];

export type MariAnalyzeModule = {
  id: MariAnalyzeModuleId;
  label: string;
  /** Name, den die AI als verbindliches Produkt bekommt */
  vendorLabel: string;
  helpUrl?: string;
  helpHint?: string;
  /** SAP Help Portal product id for live search */
  sapProductId?: string;
};

export const MARI_ANALYZE_MODULES: readonly MariAnalyzeModule[] = [
  {
    id: "sap-b1-sql",
    label: "SAP Business One (SQL)",
    vendorLabel: "SAP Business One (SQL Server)",
    helpUrl: "https://help.sap.com/docs/SAP_BUSINESS_ONE?locale=en-US",
    helpHint:
      "SAP Help Portal — Business One (SQL). Mit Symptom, Fehlermeldung und Objekt/Tabelle suchen.",
    sapProductId: "SAP_BUSINESS_ONE",
  },
  {
    id: "sap-b1-hana",
    label: "SAP Business One for HANA",
    vendorLabel: "SAP Business One for HANA",
    helpUrl:
      "https://help.sap.com/docs/SAP_BUSINESS_ONE_VERSION_FOR_SAP_HANA?locale=en-US",
    helpHint:
      "SAP Help Portal — Business One, Version for SAP HANA. Mit Symptom, Fehlermeldung und Objekt/Tabelle suchen.",
    sapProductId: "SAP_BUSINESS_ONE_VERSION_FOR_SAP_HANA",
  },
  {
    id: "coresuite",
    label: "Coresuite",
    vendorLabel: "Coresystems coresuite",
    helpUrl: "https://helpdesk.coresystems.ch",
    helpHint:
      "Coresystems Helpdesk (Designer, Customize, Service, Mobile). Mit Fehlermeldung und Modul suchen.",
  },
  {
    id: "boyum-beas",
    label: "Boyum - BEAS",
    vendorLabel: "Boyum BEAS Manufacturing",
    helpUrl: "https://help.beascloud.com",
    helpHint: "Beas-Hilfe: Fertigung, Belegfluss, Scripting.",
  },
  {
    id: "boyum-b1up",
    label: "Boyum - B1Up",
    vendorLabel: "Boyum B1 Usability Package (B1UP)",
    helpUrl: "https://help.boyum-it.com/B1UP/",
    helpHint: "B1UP-Handbuch: Functions, Formatted Search, UI-Regeln.",
  },
  {
    id: "ang",
    label: "ANG Produkte",
    vendorLabel: "ANG Produkte",
    helpHint: "ANG-Add-ons / Partnerprodukte — nur dieses Produktumfeld, nicht raten.",
  },
  {
    id: "sql-server",
    label: "SQL Server",
    vendorLabel: "Microsoft SQL Server",
    helpUrl: "https://learn.microsoft.com/sql/",
    helpHint: "Microsoft Learn — T-SQL, Agent, Backup, Berechtigungen.",
  },
  {
    id: "linux",
    label: "Linux",
    vendorLabel: "Linux / OS",
    helpHint: "Linux-Betrieb (SUSE/RHEL/Ubuntu): Dienste, Platte, Logs, Netzwerk.",
  },
  {
    id: "hana",
    label: "HANA",
    vendorLabel: "SAP HANA",
    helpUrl: "https://help.sap.com/docs/SAP_HANA_PLATFORM?locale=en-US",
    helpHint: "HANA-Plattform: Indexserver, Speicher, hdbsql, M_*-Views — nicht S/4.",
    sapProductId: "SAP_HANA_PLATFORM",
  },
];

const MODULE_BY_ID = new Map(
  MARI_ANALYZE_MODULES.map((m) => [m.id, m] as const)
);

export function isMariAnalyzeModuleId(id: string): id is MariAnalyzeModuleId {
  return MODULE_BY_ID.has(id as MariAnalyzeModuleId);
}

/** Unbekannte IDs verwerfen, Reihenfolge wie im Katalog, max. alle Module. */
export function parseAnalyzeModuleIds(raw: unknown): MariAnalyzeModuleId[] {
  if (!Array.isArray(raw)) return [];
  const found: MariAnalyzeModuleId[] = [];
  for (const item of raw) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!isMariAnalyzeModuleId(id) || found.includes(id)) continue;
    found.push(id);
  }
  return MARI_ANALYZE_MODULES.map((m) => m.id).filter((id) =>
    found.includes(id)
  );
}

export function analyzeModulesFromIds(
  ids: readonly string[]
): MariAnalyzeModule[] {
  return parseAnalyzeModuleIds(ids)
    .map((id) => MODULE_BY_ID.get(id))
    .filter((m): m is MariAnalyzeModule => m != null);
}

export function vendorLabelsFromModules(
  modules: readonly MariAnalyzeModule[]
): string[] {
  return modules.map((m) => m.vendorLabel);
}

/**
 * Ausgewählte Module ersetzen die Text-Heuristik.
 * Leere Auswahl → Aufrufer soll die bisherige Heuristik nutzen.
 */
export function resolveAnalyzeVendorHints(opts: {
  selectedIds: readonly string[];
  heuristicVendors: string[];
}): { selected: MariAnalyzeModule[]; vendorHints: string[] } {
  const selected = analyzeModulesFromIds(opts.selectedIds);
  if (selected.length === 0) {
    return { selected, vendorHints: opts.heuristicVendors };
  }
  return { selected, vendorHints: vendorLabelsFromModules(selected) };
}

export function manufacturerSourcesPrompt(
  modules: readonly MariAnalyzeModule[]
): string {
  if (modules.length === 0) return "";
  const lines = modules.map((m) => {
    const url = m.helpUrl ? ` — ${m.helpUrl}` : "";
    const hint = m.helpHint ? ` ${m.helpHint}` : "";
    return `- ${m.vendorLabel}${url}.${hint}`;
  });
  return `AUSGEWÄHLTE PRODUKTE (vom Support gesetzt — verbindlich, nicht raten):
${lines.join("\n")}
Diese Portale zuerst für Diagnose/Lösung nutzen: Suchbegriffe aus Betreff, Fehlermeldung, Objekt/Tabelle und Screenshot-Text bilden. In outline/steps/caveats die konkreten Themenpfade bzw. Treffer-URLs nennen — KEINE erfundenen Note-/KB-Nummern.`;
}
