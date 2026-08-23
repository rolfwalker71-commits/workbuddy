/**
 * Client-safe ticket-analysis types and SQL pairing helpers.
 * No OpenAI / db / Node-only imports — keep this out of analyze-ticket.ts.
 */

export type MariSolutionArtifact = {
  kind: string;
  title: string;
  language: string;
  code: string;
  note?: string | null;
};

export type MariSolutionStep = {
  where: string;
  action: string;
  detail?: string | null;
};

export type MariSolutionSketch = {
  problemStillOpen: boolean;
  outline: string;
  vendors: string[];
  steps: MariSolutionStep[];
  artifacts: MariSolutionArtifact[];
  caveats?: string | null;
  confidence?: "high" | "medium" | "low";
};

export type MariTicketAnalysis = {
  summary: string;
  completeness: {
    score: number;
    missing: string[];
    notes?: string;
  };
  suggestedTasks: Array<{
    title: string;
    reason?: string;
    dueHint?: string | null;
    kind: "support_todo" | "other";
    confidence: "high" | "medium" | "low";
    ticketRef?: string | null;
  }>;
  suggestions: string[];
  recommendedStatus?: {
    statusId?: number | null;
    label?: string;
    reason?: string;
  } | null;
  nextReplyDraft?: string | null;
  solutionSketch?: MariSolutionSketch | null;
};

export function artifactKindLabel(kind: string): string {
  switch (kind) {
    case "sql_hana":
      return "HANA";
    case "sql_sqlserver":
      return "SQL Server";
    case "sql":
      return "SQL";
    case "transaction_notification":
      return "Transaction Notification";
    case "formatted_search":
      return "Formatted Search";
    case "coresuite_customize":
      return "coresuite Customize";
    case "stored_procedure":
      return "Stored Procedure";
    case "di_api":
      return "DI-API";
    case "service_layer":
      return "Service Layer";
    case "powershell":
      return "PowerShell";
    case "bash":
      return "Bash";
    case "script":
      return "Skript";
    case "config":
      return "Config";
    default:
      return kind || "Sonstiges";
  }
}

function artifactPurposeKey(title: string): string {
  return title
    .replace(
      /\s*[(\[{]?\s*(hana|sap\s*hana|sql\s*server|mssql|ms\s*sql|t-?sql)\s*[)\]}]?\s*$/i,
      ""
    )
    .replace(
      /\s*[-–—|:]\s*(hana|sap\s*hana|sql\s*server|mssql|ms\s*sql|t-?sql)\s*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type GroupedSolutionArtifact =
  | {
      type: "pair";
      purpose: string;
      hana: MariSolutionArtifact;
      sqlserver: MariSolutionArtifact;
    }
  | { type: "single"; artifact: MariSolutionArtifact };

/** Paart HANA- und SQL-Server-Varianten desselben Zwecks für die Anzeige. */
export function groupSolutionArtifacts(
  artifacts: MariSolutionArtifact[]
): GroupedSolutionArtifact[] {
  const used = new Set<number>();
  const groups: GroupedSolutionArtifact[] = [];

  for (let i = 0; i < artifacts.length; i++) {
    if (used.has(i)) continue;
    const a = artifacts[i];
    if (a.kind !== "sql_hana" && a.kind !== "sql_sqlserver") {
      used.add(i);
      groups.push({ type: "single", artifact: a });
      continue;
    }

    const want = a.kind === "sql_hana" ? "sql_sqlserver" : "sql_hana";
    const key = artifactPurposeKey(a.title);
    let match = -1;
    for (let j = 0; j < artifacts.length; j++) {
      if (j === i || used.has(j)) continue;
      if (artifacts[j].kind !== want) continue;
      if (artifactPurposeKey(artifacts[j].title) === key) {
        match = j;
        break;
      }
    }
    if (match < 0) {
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= artifacts.length || used.has(j)) continue;
        if (artifacts[j].kind === want) {
          match = j;
          break;
        }
      }
    }
    if (match >= 0) {
      used.add(i);
      used.add(match);
      const other = artifacts[match];
      const hana = a.kind === "sql_hana" ? a : other;
      const sqlserver = a.kind === "sql_sqlserver" ? a : other;
      const purpose =
        a.title
          .replace(
            /\s*[(\[{]?\s*(hana|sap\s*hana|sql\s*server|mssql|ms\s*sql|t-?sql)\s*[)\]}]?\s*$/i,
            ""
          )
          .replace(
            /\s*[-–—|:]\s*(hana|sap\s*hana|sql\s*server|mssql|ms\s*sql|t-?sql)\s*$/i,
            ""
          )
          .trim() || a.title;
      groups.push({ type: "pair", purpose, hana, sqlserver });
      continue;
    }

    used.add(i);
    groups.push({ type: "single", artifact: a });
  }

  return groups;
}

export function parseIsoDueHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}
