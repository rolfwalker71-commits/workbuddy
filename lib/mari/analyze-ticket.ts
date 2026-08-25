import { getOpenAIClient, getOpenAIModel, hasOpenAIKey } from "@/lib/ai/client";
import {
  buildAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import {
  manufacturerSourcesPrompt,
  resolveAnalyzeVendorHints,
  type MariAnalyzeModule,
} from "@/lib/mari/analyze-modules";
import {
  buildVendorDocSearchQuery,
  fetchAnalyzeVendorDocs,
  formatVendorDocHitsForPrompt,
} from "@/lib/mari/analyze-vendor-docs";
import type { MariTicketDetail } from "@/lib/mari/tickets";
import { timelineSideLabel } from "@/lib/mari/timeline-side";
import {
  detectReplyAddressForm,
  detectReplyLanguage,
  replyAddressFormInstruction,
} from "@/lib/microsoft/reply-language-shared";
import { z } from "zod";

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function asString(v: unknown, max: number): string {
  if (v == null) return "";
  if (typeof v === "string") return clip(v, max);
  if (typeof v === "number" || typeof v === "boolean") {
    return clip(String(v), max);
  }
  return clip(JSON.stringify(v), max);
}

function asNullableString(v: unknown, max: number): string | null {
  if (v == null || v === "") return null;
  const s = asString(v, max);
  return s || null;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", ".").trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asStringArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => asString(x, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "ja"].includes(s)) return true;
    if (["false", "0", "no", "nein"].includes(s)) return false;
  }
  return fallback;
}

function normalizeSolutionStep(raw: unknown): {
  where: string;
  action: string;
  detail: string | null;
} | null {
  if (typeof raw === "string") {
    const action = clip(raw, 500);
    if (!action) return null;
    return { where: "Allgemein", action, detail: null };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const action = asString(
    o.action ?? o.step ?? o.what ?? o.title ?? o.text,
    500
  );
  if (!action) return null;
  return {
    where: asString(o.where ?? o.app ?? o.location ?? o.ort, 200) || "Allgemein",
    action,
    detail: asNullableString(o.detail ?? o.how ?? o.beschreibung, 1600),
  };
}

const ARTIFACT_KINDS = new Set([
  "sql_hana",
  "sql_sqlserver",
  "sql",
  "transaction_notification",
  "formatted_search",
  "coresuite_customize",
  "stored_procedure",
  "di_api",
  "service_layer",
  "powershell",
  "bash",
  "script",
  "config",
  "other",
]);

function normalizeSolutionArtifact(raw: unknown): {
  kind: string;
  title: string;
  language: string;
  code: string;
  note: string | null;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const code = asString(
    o.code ?? o.content ?? o.body ?? o.sql ?? o.script,
    9000
  );
  if (!code) return null;
  let kind = asString(o.kind ?? o.type ?? o.format, 40).toLowerCase() || "other";
  if (kind === "tn" || kind === "sbo_sp_transactionnotification") {
    kind = "transaction_notification";
  }
  if (kind === "fs" || kind === "formattedsearch") {
    kind = "formatted_search";
  }
  if (
    kind === "shell" ||
    kind === "linux" ||
    kind === "bash_script" ||
    kind === "sh"
  ) {
    kind = "bash";
  }
  if (!ARTIFACT_KINDS.has(kind)) kind = "other";
  const language =
    asString(o.language ?? o.lang, 40) ||
    (kind.startsWith("sql") ||
    kind === "transaction_notification" ||
    kind === "stored_procedure" ||
    kind === "formatted_search"
      ? kind === "sql_hana"
        ? "sql-hana"
        : "sql"
      : kind === "coresuite_customize"
        ? "csharp"
        : kind === "powershell"
          ? "powershell"
          : kind === "bash"
            ? "bash"
            : "text");
  return {
    kind,
    title: asString(o.title ?? o.name ?? o.label, 160) || "Artefakt",
    language,
    code,
    note: asNullableString(o.note ?? o.hinweis ?? o.caveat, 800),
  };
}

function normalizeSolutionSketch(raw: unknown): unknown {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const outline = clip(raw, 6000);
    if (!outline) return null;
    return {
      problemStillOpen: true,
      outline,
      vendors: [],
      steps: [],
      artifacts: [],
      caveats:
        "Vorschlag aus allgemeinem Herstellerwissen — mit help.sap.com / offizieller Doku abgleichen.",
      confidence: "medium",
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const outline = asNullableString(o.outline ?? o.sketch ?? o.text, 6000);
  if (!outline) return null;

  const stepsRaw = Array.isArray(o.steps)
    ? o.steps
    : Array.isArray(o.appSteps)
      ? o.appSteps
      : [];
  const steps = stepsRaw
    .map(normalizeSolutionStep)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 16);

  const artifactsRaw = Array.isArray(o.artifacts)
    ? o.artifacts
    : Array.isArray(o.codeSnippets)
      ? o.codeSnippets
      : [];
  const artifacts = artifactsRaw
    .map(normalizeSolutionArtifact)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 16);

  return {
    problemStillOpen: asBoolean(
      o.problemStillOpen ?? o.applicable ?? o.open,
      true
    ),
    outline,
    vendors: asStringArray(o.vendors ?? o.hersteller, 8, 80),
    steps,
    artifacts,
    caveats: asNullableString(o.caveats ?? o.hinweis, 1500),
    confidence: (() => {
      const c = asString(o.confidence ?? o.conf, 12).toLowerCase();
      return c === "high" || c === "medium" || c === "low" ? c : "medium";
    })(),
  };
}

/** Normalize loose AI JSON before Zod (common type/length drift). */
export function normalizeMariTicketAnalysisInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      summary: "",
      completeness: { score: 0, missing: [], notes: "" },
      suggestedTasks: [],
      suggestions: [],
      recommendedStatus: null,
      nextReplyDraft: null,
      solutionSketch: null,
    };
  }
  const o = raw as Record<string, unknown>;
  const completenessRaw =
    o.completeness && typeof o.completeness === "object" && !Array.isArray(o.completeness)
      ? (o.completeness as Record<string, unknown>)
      : {};

  const tasksRaw = Array.isArray(o.suggestedTasks) ? o.suggestedTasks : [];
  const suggestedTasks = tasksRaw.slice(0, 10).map((item) => {
    const t: Record<string, unknown> =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : { title: item };
    const confRaw = asString(t.confidence ?? t.conf, 12).toLowerCase();
    const confidence =
      confRaw === "high" || confRaw === "medium" || confRaw === "low"
        ? confRaw
        : "medium";
    const kindRaw = asString(t.kind ?? t.type, 24).toLowerCase();
    const kind = kindRaw === "other" ? "other" : "support_todo";
    return {
      title: asString(t.title, 200) || "Aufgabe",
      reason: asNullableString(t.reason, 500) ?? undefined,
      dueHint: asNullableString(t.dueHint, 40),
      kind,
      confidence,
      ticketRef: asNullableString(t.ticketRef ?? t.ticket, 40),
    };
  });

  let recommendedStatus: unknown = null;
  const rs = o.recommendedStatus;
  if (rs && typeof rs === "object" && !Array.isArray(rs)) {
    const r = rs as Record<string, unknown>;
    const statusIdRaw = r.statusId;
    let statusId: number | null = null;
    if (statusIdRaw != null && statusIdRaw !== "") {
      const n = asNumber(statusIdRaw, NaN);
      statusId = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    recommendedStatus = {
      statusId,
      label: asNullableString(r.label, 80) ?? undefined,
      reason: asNullableString(r.reason, 500) ?? undefined,
    };
  } else if (typeof rs === "string" && rs.trim()) {
    recommendedStatus = {
      statusId: null,
      label: clip(rs, 80),
      reason: undefined,
    };
  }

  const score = Math.min(100, Math.max(0, Math.round(asNumber(completenessRaw.score, 0))));

  return {
    summary: asString(o.summary, 1800) || "Keine Zusammenfassung.",
    completeness: {
      score,
      missing: asStringArray(completenessRaw.missing, 10, 280),
      notes: asNullableString(completenessRaw.notes, 800) ?? undefined,
    },
    suggestedTasks,
    suggestions: asStringArray(o.suggestions, 8, 300),
    recommendedStatus,
    nextReplyDraft: asNullableString(o.nextReplyDraft, 2000),
    solutionSketch: normalizeSolutionSketch(o.solutionSketch),
  };
}

export const MariSolutionStepSchema = z.object({
  /** App / Modul / Ort (z.B. «SAP B1 → Verwaltung → …», «coresuite Designer») */
  where: z.string().min(1).max(200),
  /** Was tun */
  action: z.string().min(1).max(500),
  /** Wie genau: Klicks, Felder, Werte, Reihenfolge */
  detail: z.string().max(1600).nullable().optional(),
});

export const MariSolutionArtifactSchema = z.object({
  kind: z.enum([
    "sql_hana",
    "sql_sqlserver",
    "sql",
    "transaction_notification",
    "formatted_search",
    "coresuite_customize",
    "stored_procedure",
    "di_api",
    "service_layer",
    "powershell",
    "bash",
    "script",
    "config",
    "other",
  ]),
  title: z.string().min(1).max(160),
  language: z.string().max(40).default("text"),
  code: z.string().min(1).max(9000),
  note: z.string().max(800).nullable().optional(),
});

export const MariSolutionSketchSchema = z.object({
  /** false wenn Fall bereits gelöst/obsolet — dann UI ausblenden */
  problemStillOpen: z.boolean(),
  /** Ausführliche Analyse / Lösungsstrategie */
  outline: z.string().min(1).max(6000),
  vendors: z.array(z.string().max(80)).max(8).default([]),
  /** Step-by-step in Apps / Administration */
  steps: z.array(MariSolutionStepSchema).max(16).default([]),
  /** SQL/HANA, TN, Customize, SP, Scripts usw. */
  artifacts: z.array(MariSolutionArtifactSchema).max(16).default([]),
  caveats: z.string().max(1500).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export const MariTicketAnalysisSchema = z.object({
  summary: z.string().min(1).max(1800),
  completeness: z.object({
    score: z.number().min(0).max(100),
    missing: z.array(z.string().max(280)).max(10),
    notes: z.string().max(800).optional(),
  }),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        reason: z.string().max(500).optional(),
        dueHint: z.string().max(40).nullable().optional(),
        kind: z.enum(["support_todo", "other"]).default("support_todo"),
        confidence: z.enum(["high", "medium", "low"]).default("medium"),
        ticketRef: z.string().max(40).nullable().optional(),
      })
    )
    .max(10),
  suggestions: z.array(z.string().max(300)).max(8),
  recommendedStatus: z
    .object({
      statusId: z.number().int().positive().nullable().optional(),
      label: z.string().max(80).optional(),
      reason: z.string().max(500).optional(),
    })
    .nullable()
    .optional(),
  nextReplyDraft: z.string().max(2000).nullable().optional(),
  solutionSketch: MariSolutionSketchSchema.nullable().optional(),
});

export type MariTicketAnalysis = z.infer<typeof MariTicketAnalysisSchema>;
export type MariSolutionSketch = z.infer<typeof MariSolutionSketchSchema>;
export type MariSolutionArtifact = z.infer<typeof MariSolutionArtifactSchema>;

export {
  artifactKindLabel,
  groupSolutionArtifacts,
  parseIsoDueHint,
} from "./analyze-ticket-shared";
export type { GroupedSolutionArtifact } from "./analyze-ticket-shared";

/** Heuristik: relevante Hersteller/Produkte aus Tickettext für den Prompt. */
export function detectRelevantVendorsFromTicketText(text: string): string[] {
  const t = (text || "").toLowerCase();
  const found: string[] = [];
  const add = (label: string, re: RegExp) => {
    if (re.test(t) && !found.includes(label)) found.push(label);
  };
  add("SAP Business One", /\b(sap\s*b1|business\s*one|sbo\b|ocrd|oinv|di-?api|service\s*layer|udf|udt|formatted\s*search|transaction\s*notification)\b/i);
  add("SAP HANA", /\b(hana|sqlscript|hdbsql|hdbdaemon|hdbindexserver)\b/i);
  add(
    "Microsoft SQL Server",
    /\b(sql\s*server|mssql|ms\s*sql|t-sql|tsql)\b/i
  );
  add("Linux / OS", /\b(linux|suse|rhel|redhat|ubuntu|systemd|ssh|bash|shell|df\s+-h|journalctl)\b/i);
  add("Coresystems coresuite", /\b(coresystems|coresuite|core\s*suite|customize)\b/i);
  add("Boyum IT", /\b(boyum|b1up|b1\s*usability|produmex|print\s*&\s*delivery|boyum\s*insight)\b/i);
  add("Produmex", /\bprodumex\b/i);
  add(
    "Microsoft 365",
    /\b(microsoft\s*365|m365|office\s*365|outlook|exchange|graph\s*api|entra|azure\s*ad|teams|power\s*automate)\b/i
  );
  add("Maringo MARI", /\b(maringo|mari\b|hotline)\b/i);
  // B1-Kontext ohne explizites SAP-Wort: Standardtabellen / Support-Stack
  if (
    !found.some((v) => v.startsWith("SAP")) &&
    /\b(beleg|geschäftspartner|artikelstamm|lagerverwaltung)\b/i.test(t)
  ) {
    found.unshift("SAP Business One");
  }
  return found.slice(0, 8);
}

export function specialistRoleLine(vendorHints: string[]): string {
  if (vendorHints.length === 0) {
    return "Kein klares Produkt erkennbar — kein Produktspezialist vortäuschen. Allgemein bleiben und in completeness.notes schreiben, dass Stack/Produkt unklar ist.";
  }
  return `Für DIESES Ticket bist du Spezialist für: ${vendorHints.join(", ")}. Diagnose und Behebung nur in den üblichen Pfaden dieser Produkte. Keine fachfremden Module oder SAP-ECC/S/4-T-Codes.`;
}

export function formatSupportTodoTitle(
  issueId: number,
  title: string
): string {
  const clean = title
    .replace(/^#\d+\s*/u, "")
    .replace(/^\[\s*#?\d+\s*\]\s*/u, "")
    .trim();
  return `#${issueId} ${clean || "Support-Aufgabe"}`.slice(0, 200);
}

export function buildMariTicketAnalysisSystemPrompt(
  vendorHints: string[],
  selectedModules: readonly MariAnalyzeModule[] = []
): string {
  const selectedSources = manufacturerSourcesPrompt(selectedModules);
  return `Du bist Buddy, Senior-Support-Assistent für Maringo/MARI Tickets (Schweiz, de-CH).
${specialistRoleLine(vendorHints)}
${selectedSources ? `${selectedSources}\n` : ""}Kontext-Stack (nur nutzen wenn im Ticket erkennbar, vom Support ausgewählt oder in der Heuristik oben genannt): SAP Business One (B1) inkl. HANA und Microsoft SQL Server, Transaction Notification (SBO_SP_TransactionNotification), Formatted Search, UDFs/UDT, DI-API, Service Layer, Add-ons (Coresystems/coresuite, Boyum IT / BEAS / B1UP, ANG), Microsoft 365/Outlook/Graph, Maringo/MARI.
WICHTIG zu SAP: IMMER SAP Business One — NIEMALS R/3, ECC, S/4HANA, Fiori oder ECC-T-Codes.

GROUNDING — drei Schichten, nichts erfinden:
1) BELEG: nur Fakten aus Ticket, Verlauf oder Screenshot (Fehlertext wörtlich zitieren).
2) STANDARDWISSEN: übliche Hersteller-Pfade (help.sap.com-Themen, B1-Menüs, OCRD/OINV, M_*-Views). KEINE erfundenen Note-/KB-Nummern, keine Fantasie-UI-Klicks oder Tabellenfelder.
3) HYPOTHESE: 2–3 Alternativen mit Für/Wider + Unsicherheit — nie als Tatsache.
Unbekanntes → completeness.missing (Frage), nicht als Lösungsschritt. confidence high|medium|low ehrlich setzen.

REASONING (sichtbar in summary, outline, reasons — nicht intern verschlucken):
- Reihenfolge: Symptom zitieren → Produkt/Modul (erkannt/unklar) → 2–3 Hypothesen mit Für/Wider → wahrscheinlichste Diagnose → was zuerst PRÜFEN (lesen) → Behebung gemäss Produkt → Verifikation → was unsicher bleibt.
- summary: 6–10 Sätze, kein Telegrammstil.
- outline: ausformulierte Argumentation (nicht Stichworte).
- suggestedTasks[].reason und recommendedStatus.reason konkret begründen.
- Keine Diagnose ohne Beleg; dünne Evidenz in completeness.notes.

VISION (wenn Bilder mitgeliefert):
- Jedes Bild bewusst lesen: Fenster/UI-Pfad, exakter Fehlertext, Codes, rote Markierungen, Versionen, Firma, betroffene Belege/Felder.
- Sichtbaren Fehlertext wörtlich in summary oder completeness.missing zitieren.
- Bilder als Beleg oder Widerspruch zum Text nutzen — nicht nur «Screenshot vorhanden».
- Unscharf/unleserlich: in completeness.notes sagen, nicht raten.

HERSTELLER / PRODUKTWISSEN (solutionSketch — Pflicht wenn relevant):
${
  selectedModules.length > 0
    ? "Der Support hat die betroffenen Produkte explizit gewählt. vendors[] muss genau diese Namen enthalten (plus höchstens eng verwandte, z. B. SQL Server bei B1-SQL). Nicht in andere Produkte abschweifen."
    : "Ermittle aus Ticket-Produkt, Betreff, Anfrage und Verlauf, welche Hersteller/Produkte betroffen sind, und nutze typisches Produktwissen in outline/steps/artifacts/caveats. vendors[] muss die relevanten Namen listen."
}
Typische Quellen (Themenpfade nennen — KEINE erfundenen Note-/KB-Nummern):
- SAP Business One (SQL): https://help.sap.com/docs/SAP_BUSINESS_ONE?locale=en-US — dort mit Suchbegriffen (Fehlertext, Objekt, Tabelle, Funktion) den passenden Bereich holen.
- SAP Business One for HANA: https://help.sap.com/docs/SAP_BUSINESS_ONE_VERSION_FOR_SAP_HANA?locale=en-US — analog suchen, HANA-spezifische Themen bevorzugen.
- Coresystems / coresuite: https://helpdesk.coresystems.ch — Customize, Designer, Service, Mobile; C#-ähnliche Customize-Skizzen wenn Addon betroffen.
- Boyum BEAS: https://help.beascloud.com — Fertigung/Belegfluss/Script nur wenn BEAS gewählt oder klar im Ticket.
- Boyum B1UP: https://help.boyum-it.com/B1UP/ — Functions, UI-Regeln, Formatted Search nur wenn B1UP gewählt oder klar im Ticket.
- Microsoft SQL Server: Microsoft Learn (T-SQL, Agent, Backup) wenn SQL Server gewählt oder B1-SQL betroffen.
- Linux / HANA-Betrieb: Distribution-Docs + SAP HANA Platform (https://help.sap.com/docs/SAP_HANA_PLATFORM?locale=en-US) wenn Linux/HANA gewählt.
- ANG Produkte: nur wenn gewählt oder klar im Ticket; keine fremden Add-ons unterschieben.
- Microsoft 365: Microsoft Learn (Graph, Outlook/Exchange, Entra ID) wenn Mail/Auth betroffen.
- Maringo / MARI: Ticket-/Support-Prozess nur wenn Buddy/MARI selbst Thema ist.
In outline: kurz sagen, welches Herstellerverhalten/Limit bekannt ist (z. B. Customize-Event-Reihenfolge, B1UP-Regel vs. TN) — als Support-Hypothese, nicht als garantierte Spec. Wenn Hersteller-Treffer im User-Prompt stehen, diese zuerst auswerten.

HANA SQL (kind sql_hana / language sql-hana) — SYNTAX HART:
- Nur SAP HANA SQL / SQLScript-Notation — KEINE SQL-Server-Syntax mischen.
- Identifier doppelt quoten: "OCRD", "CardCode", "DocEntry" (B1-HANA-Standard).
- KEINE eckigen Klammern [OCRD], kein GO, kein ISNULL() → IFNULL() oder COALESCE().
- String-Verkettung mit || (nicht +).
- TOP: SELECT TOP 100 "CardCode" FROM "OCRD" … (oder LIMIT am Ende, konsistent HANA).
- Kommentare: -- und /* */.
- Schema/Firmen-DB als Platzhalter kommentieren (z. B. /* Schema = aktuelle Firmen-DB */), keine erfundenen Schema-Namen als Fakt.
- Diagnose-SELECTs kommentiert, Platzhalter klar ('C00001' / /* @CardCode */).
- SQL IMMER doppelt: sql_hana UND sql_sqlserver als getrennte artifacts (nie nur eine Variante, auch wenn HANA im Ticket steht).
- MS SQL (sql_sqlserver): [OCRD]/[CardCode], ISNULL ok, String-Verkettung oft +; keine HANA-only-Funktionen.
- Transaction Notification: HANA = SQLSCRIPT (IN/OUT ohne @); SQL Server = @object_type/@transaction_type/… — wenn TN geliefert wird, idealerweise BEIDE Varianten. Nie HANA-Artifact mit T-SQL-@Variablen als «HANA» ausgeben.

LINUX / HANA-BETRIEB (wenn Ticket Linux, SUSE, RHEL, HANA-Server, Speicher, Dienste, Backup, hdbsql, Indexserver, Netzwerk betrifft):
- Zusätzlich praxisnahe Diagnose-/Fix-Hilfen liefern:
  1) kind bash / language bash: Shell-Befehle (systemctl status/restart für HANA-Dienste wo üblich, df -h, free -h, journalctl, top/htop, ls -la auf Trace-/Log-Pfade, HDB info / sapcontrol wo passend). Kommentiert, Platzhalter für SID/Instanz/Host.
  2) HANA-seitig: hdbsql-Beispiele, M_*-Monitoring-Views (z. B. M_SERVICES, M_DISK_USAGE, M_CONNECTIONS) als sql_hana — und parallel sql_sqlserver nur wenn B1-Datenbank-SQL gemeint ist; bei reinem HANA-OS/DB-Admin reichen bash + sql_hana.
- Keine destruktiven rm -rf / DROP ohne klare Warnung in note; kein Blind-Restart auf Produktiv ohne Hinweis.
- steps: wo relevant Linux-Pfad und HANA Studio/Database Explorer nennen.

Nachschlagewerke (in caveats/outline die konkreten URLs/Themenpfade nennen):
- https://help.sap.com/docs/SAP_BUSINESS_ONE?locale=en-US
- https://help.sap.com/docs/SAP_BUSINESS_ONE_VERSION_FOR_SAP_HANA?locale=en-US
- https://helpdesk.coresystems.ch
- https://help.beascloud.com · https://help.boyum-it.com/B1UP/
- Microsoft Learn für SQL Server / Graph / Outlook

Verlauf-Legende ([Seite: …]):
- «Support (wir)» = eure Antworten/Rückfragen/Notizen — keine Kundenfakten.
- «Kunde» = Kundenmeldung/Eingang.
- «System» = automatische Feldänderungen.
- «Unklar» = nicht als Kundenfakt werten.
Support- und Kundenaussagen getrennt auswerten; bereits geklärte Punkte nicht erneut fragen.

Liefere JSON genau in diesem Schema:
{
  "summary": "string, 6–10 Sätze, max ~1800 Zeichen",
  "completeness": { "score": 0-100, "missing": ["…"], "notes": "optional" },
  "suggestedTasks": [{
    "title": "kurze Support-Aufgabe ohne Ticketpräfix",
    "reason": "warum WIR das tun müssen (Beleg)",
    "dueHint": "YYYY-MM-DD|null",
    "kind": "support_todo",
    "confidence": "high|medium|low",
    "ticketRef": "#12345"
  }],
  "suggestions": ["…"],
  "recommendedStatus": { "statusId": 11|1|3|6|7|14|2|null, "label": "optional", "reason": "optional" } | null,
  "nextReplyDraft": "Kundenantwort in der Sprache/Anrede des Verlaufs oder null",
  "solutionSketch": {
    "problemStillOpen": true|false,
    "outline": "AUSFÜHRLICHE begründete Analyse: Hypothesen mit Für/Wider, Screenshot-Evidenz, B1-Objekte/Tabellen, Addon-/Cloud-Einfluss, Risiken, Alternativen, warum dieser Weg zuerst",
    "vendors": ["SAP Business One", "Coresystems coresuite", "…"],
    "steps": [
      {
        "where": "konkreter Ort (Client-Menü, HANA Studio/Database Explorer, B1 Studio, coresuite Designer, Boyum/B1UP, …)",
        "action": "Was genau",
        "detail": "Step-by-step: Klicks, Felder, erwartetes Ergebnis, Fallback wenn Schritt scheitert"
      }
    ],
    "artifacts": [
      {
        "kind": "sql_hana|sql_sqlserver|sql|transaction_notification|formatted_search|coresuite_customize|stored_procedure|di_api|service_layer|powershell|bash|script|config|other",
        "title": "…",
        "language": "sql-hana|sql|csharp|js|powershell|bash|json|text|…",
        "code": "AUSFÜHRLICHES, lauffähig skizziertes Skript (Kommentare, Platzhalter klar; HANA nur HANA-Syntax)",
        "note": "DB-Variante, Deploy-Hinweis, Test auf Testfirma, Doku-Themenpfad"
      }
    ],
    "caveats": "Unsicherheiten + Doku-Pfade je Hersteller",
    "confidence": "high|medium|low"
  } | null
}

solutionSketch — UMFANGREICH und PRAXISTAUGICH (Support-Qualität):
- Nur wenn Problem noch offen; sonst problemStillOpen=false oder null.
- outline: nicht nur 2 Sätze — Ursache, Auswirkungen, Lösungsstrategie, Hersteller-Kontext, Screenshot-Befunde, was man zuerst prüft vs. ändert und warum.
- vendors: alle aus Ticket erkennbaren relevanten Hersteller/Produkte (mind. SAP Business One wenn B1-Thema).
- steps: 4–12 navigierbare Schritte wo sinnvoll (Diagnose → Fix → Verifikation), inkl. Addon-/Hersteller-UI wenn betroffen.
- artifacts: LIEFERE substanzielle Skripte, sobald Daten/Regeln involviert sind. Mehrere Skripte sind erwünscht, wenn sinnvoll (Diagnose + Fix + Verifikation, mehrere Objekte).
  1) Diagnose-SELECTs (Joins, Filter mit Platzhaltern).
  2) HANA und Microsoft SQL Server sind SYNTAXISCH SEHR UNTERSCHIEDLICH. Jedes B1-Firmen-DB-Skript IMMER als Paar: kind sql_hana UND kind sql_sqlserver, gleicher Zweck, korrekte Dialekt-Syntax (Titel z. B. «BP prüfen (HANA)» / «BP prüfen (SQL Server)»). Auch wenn das Ticket nur eine DB nennt — der Kunde kann die andere haben.
  3) Transaction Notification: wenn relevant, HANA-SQLSCRIPT und SQL-Server-Variante als zwei artifacts; note = Ziel-DB.
  4) Formatted Search: kind formatted_search — Query + Zuweisung im Formular (bei SQL-FS ebenfalls HANA + SQL Server).
  5) coresuite_customize wenn Coresystems/coresuite relevant.
  6) config/script für Boyum/B1UP/Produmex wenn erkennbar.
  7) DI-API / Service Layer / PowerShell / Graph wenn passend.
  8) Bei Linux/HANA-Betrieb: bash und ggf. HANA-Monitoring-SQL — siehe LINUX / HANA-BETRIEB.
- VERBOTEN: nur sql_hana ohne sql_sqlserver (oder umgekehrt), sobald irgendein B1-Firmen-DB SQL vorkommt (reine HANA-OS-Admin-Skripte ausgenommen).

SUPPORT-TO-DOS (suggestedTasks):
- NUR Arbeit für UNS im Support (nachstellen, SQL auf Testfirma, Trace lesen, Hersteller-Ticket, interne Prüfung).
- Kundenhomework (fehlende Belege, Screenshots, Repro) → completeness.missing und nextReplyDraft, NICHT suggestedTasks.
- Jede Aufgabe: kind=support_todo, ticketRef=#<IssueID aus User-Prompt>, title OHNE #Präfix (UI setzt #IssueID), reason mit Beleg, confidence.
- Leer lassen wenn keine interne Support-Arbeit nötig ist.
- Skripte: kommentiert, idempotent wo möglich, keine destruktiven UPDATEs ohne klaren WHERE und Warnung in note.
- Keine erfundenen SAP-Note-/KB-Nummern; Themenpfade statt Fantasie-IDs.
- Klar als Vorschlag; kein Blind-Deploy auf Produktiv.
- Bereits gegebene Support-Infos im Verlauf berücksichtigen.

Screenshots: Fehlermeldungen/UI wörtlich in summary, missing, outline, steps und artifacts einbeziehen — Vision ist Teil der Diagnose, nicht Anhang.

nextReplyDraft — ANREDE (hart):
- Im User-Prompt steht «Anrede-Muster». Entweder konsequent per Du ODER konsequent formell — nie mischen.
- per Du: Hallo/Hi + Vorname wie im Verlauf; du/dir/dein.
- formell: Sehr geehrte/r bzw. Herr/Frau + Name; Sie/Ihnen/Ihr.
- Eigene Support-Antworten im Verlauf haben Vorrang vor Kundenmails.
- Schlussformel passend (z. B. Freundliche Grüsse) und Schweizer Hochdeutsch (kein ß).

Status-IDs: 11 NEU, 1 Offen, 3 In Arbeit, 6 Warte auf Kunden, 7 Warte auf Hersteller, 14 Eskalation, 2 Gelöst.
score als Zahl. Arrays nie weglassen (leer ok). NUR JSON-Objekt.`;
}

export type AnalyzeMariTicketResult = MariTicketAnalysis & {
  imagesAnalyzed: number;
  imageNames: string[];
  usage: AiTokenUsage;
};

export async function analyzeMariTicket(
  ticket: MariTicketDetail,
  options?: {
    images?: Array<{
      dataUrl: string;
      orgFilename: string;
      mimeType: string;
    }>;
    /** Optional Support-Auswahl; leer = bisherige Heuristik */
    products?: string[];
  }
): Promise<AnalyzeMariTicketResult> {
  const images = (options?.images || []).slice(0, 6);
  if (!hasOpenAIKey()) {
    throw new Error("Hinterlege deinen OpenAI-Key unter Konto");
  }

  const imageNames = images.map((i) => i.orgFilename).filter(Boolean);

  const recentTimeline = ticket.timeline.slice(-40);
  const supportTexts = recentTimeline
    .filter((t) => t.side === "support")
    .map((t) => `${t.subject || ""}\n${t.text || ""}`);
  const otherTexts = recentTimeline
    .filter((t) => t.side !== "system")
    .map((t) => `${t.subject || ""}\n${t.text || ""}`);
  const requestBlob = ticket.requestTextPlain || "";
  const addressForm = detectReplyAddressForm(
    [...otherTexts, requestBlob],
    { ourTexts: supportTexts }
  );
  const replyLang = detectReplyLanguage(
    [...supportTexts, ...otherTexts, requestBlob].join("\n")
  );
  const vendorHintBlob = [
    ticket.briefDescription,
    ticket.productName,
    ticket.issueTypeName,
    requestBlob,
    ...recentTimeline.map((t) => `${t.subject || ""}\n${t.text || ""}`),
  ].join("\n");
  const heuristicVendors = detectRelevantVendorsFromTicketText(vendorHintBlob);
  const { selected: selectedModules, vendorHints } = resolveAnalyzeVendorHints({
    selectedIds: options?.products || [],
    heuristicVendors,
  });
  const vendorDocs =
    selectedModules.length > 0
      ? await fetchAnalyzeVendorDocs({
          modules: selectedModules,
          query: buildVendorDocSearchQuery({
            briefDescription: ticket.briefDescription,
            requestText: requestBlob,
          }),
        })
      : [];
  const vendorDocBlock = formatVendorDocHitsForPrompt(vendorDocs);

  const timelineText = recentTimeline
    .map((t) => {
      const side = timelineSideLabel(t.side || "unknown");
      const actor = t.actor ? ` · Actor: ${t.actor}` : "";
      const meta = t.meta ? ` · ${t.meta}` : "";
      const att =
        t.attachments && t.attachments.length > 0
          ? `\nAnhänge: ${t.attachments.map((a) => a.orgFilename).join(", ")}`
          : "";
      return `[Seite: ${side}] [${t.at}] ${t.label}${actor}${meta}\n${
        t.subject ? t.subject + "\n" : ""
      }${t.text.slice(0, 800)}${att}`;
    })
    .join("\n\n");

  const visionHint =
    images.length > 0
      ? `

VISION-Auftrag: Lies jedes angehängte Bild genau. Transkribiere sichtbare Fehlertexte/Codes. Verknüpfe Befunde mit outline, completeness.missing und steps (welches Bild, was sichtbar). Widerspricht ein Screenshot dem Text, das explizit sagen.`
      : "";

  const userPrompt = `Ticket #${ticket.issueId}
Betreff: ${ticket.briefDescription}
Status: ${ticket.statusName} (${ticket.status})
Typ: ${ticket.issueTypeName || "–"}
Produkt: ${ticket.productName || "–"} (SAP-Kontext = Business One, nicht S/4)
Priorität: ${ticket.priorityName}
Kunde: ${ticket.cardCode || "–"}${ticket.addressMatchcode ? ` · ${ticket.addressMatchcode}` : ""}
Supportgruppe: ${ticket.supportGroupName || "–"}
Fällig: ${ticket.dueDate || "–"}
Zuständig: ${ticket.handledByName || ticket.responsible || "–"}
Screenshots/Bilder: ${
    imageNames.length
      ? `${imageNames.length} Datei(en): ${imageNames.join(", ")}`
      : "keine"
  }

${
  selectedModules.length > 0
    ? `Produkte (vom Support gewählt — verbindlich, nicht raten):
${selectedModules
  .map((m) => {
    const url = m.helpUrl ? ` | Portal: ${m.helpUrl}` : "";
    return `- ${m.vendorLabel}${url}`;
  })
  .join("\n")}`
    : `Relevante Hersteller/Produkte (Heuristik aus Ticket — in solutionSketch.vendors und outline/steps/artifacts berücksichtigen):
${
  vendorHints.length
    ? vendorHints.map((v) => `- ${v}`).join("\n")
    : "- (keine klaren Treffer — aus Verlauf selbst ableiten; bei B1-Themen mind. SAP Business One)"
}`
}
${vendorDocBlock ? `\n${vendorDocBlock}\n` : ""}
SQL-Artefakte: Bei B1-Firmen-DB-SQL IMMER beide Varianten (sql_hana + sql_sqlserver), weil die Syntax stark abweicht. Mehrere Skript-Paare sind ok, wenn Diagnose/Fix/Verifikation getrennt sinnvoll sind.
Support-To-Dos: ticketRef = #${ticket.issueId}; title ohne diese Nummer.
Bei Linux/HANA-Server-Problemen zusätzlich bash-Shell und ggf. HANA-Monitoring/hdbsql liefern.

Anrede-Muster für nextReplyDraft: ${
    addressForm === "du"
      ? "per Du"
      : addressForm === "formal"
        ? "formell"
        : "unklar"
  } (Heuristik aus Verlauf; Support-Antworten stärker gewichtet)
${replyAddressFormInstruction(addressForm, replyLang)}

Anfragetext (ursprünglich, oft Kunde):
${ticket.requestTextPlain.slice(0, 6000)}

Verlauf (chronologisch; [Seite: Support (wir)|Kunde|System|Unklar] markiert den Absender):
${timelineText.slice(0, 14000) || "(keine Positionen)"}${visionHint}`;

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "auto" | "high" } };

  const userContent: string | ContentPart[] =
    images.length === 0
      ? userPrompt
      : [
          { type: "text", text: userPrompt },
          ...images.map(
            (img): ContentPart => ({
              type: "image_url",
              image_url: { url: img.dataUrl, detail: "high" },
            })
          ),
        ];

  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.25,
    max_tokens: 12_000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildMariTicketAnalysisSystemPrompt(
          vendorHints,
          selectedModules
        ),
      },
      { role: "user", content: userContent },
    ],
  });

  const finishReason = completion.choices[0]?.finish_reason;
  const raw = completion.choices[0]?.message?.content?.trim() || "";
  if (!raw) {
    throw new Error(
      finishReason === "length"
        ? "AI-Antwort abgeschnitten (Token-Limit) — bitte erneut analysieren."
        : "AI lieferte keinen Text. Bitte erneut analysieren."
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    );
  } catch {
    throw new Error(
      finishReason === "length"
        ? "AI-Antwort war unvollständiges JSON (abgeschnitten). Bitte erneut analysieren."
        : "AI-Antwort war kein gültiges JSON."
    );
  }

  const normalized = normalizeMariTicketAnalysisInput(parsed);
  const result = MariTicketAnalysisSchema.safeParse(normalized);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      detail
        ? `AI-Antwort entsprach nicht dem Schema (${detail}).`
        : "AI-Antwort entsprach nicht dem Schema."
    );
  }
  if (isHollowMariTicketAnalysis(result.data)) {
    throw new Error(
      finishReason === "length"
        ? "AI-Antwort war abgeschnitten (Token-Limit) — keine brauchbare Zusammenfassung. Bitte erneut analysieren."
        : "AI-Antwort war leer (keine brauchbare Zusammenfassung). Bitte erneut analysieren."
    );
  }
  return {
    ...result.data,
    imagesAnalyzed: images.length,
    imageNames,
    usage: buildAiTokenUsage(model, completion.usage),
  };
}

/** Placeholder / truncated JSON that looks „fertig“, aber nichts enthält. */
export function isHollowMariTicketAnalysis(
  analysis: MariTicketAnalysis
): boolean {
  const summary = analysis.summary.trim();
  const emptySummary =
    !summary ||
    summary === "Keine Zusammenfassung." ||
    summary === "Keine Zusammenfassung";
  const noSubstance =
    analysis.suggestedTasks.length === 0 &&
    analysis.suggestions.length === 0 &&
    !analysis.nextReplyDraft?.trim() &&
    !analysis.solutionSketch?.outline?.trim();
  return emptySummary && analysis.completeness.score === 0 && noSubstance;
}
