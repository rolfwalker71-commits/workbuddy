import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMariTicketAnalysisSystemPrompt,
  buildTimelinePromptBlock,
  detectRelevantVendorsFromTicketText,
  formatSupportTodoTitle,
  groupSolutionArtifacts,
  normalizeMariTicketAnalysisInput,
  parseIsoDueHint,
  specialistRoleLine,
} from "./analyze-ticket.ts";
import {
  analyzeModulesFromIds,
  resolveAnalyzeVendorHints,
} from "./analyze-modules.ts";

test("specialist role names detected products", () => {
  assert.match(
    specialistRoleLine(["SAP Business One", "SAP HANA"]),
    /Spezialist für: SAP Business One, SAP HANA/
  );
  assert.match(specialistRoleLine([]), /kein Produktspezialist/i);
});

test("ticket analysis keeps heuristic when no module is selected", () => {
  const heuristic = detectRelevantVendorsFromTicketText(
    "Fehler in OCRD auf HANA"
  );
  const resolved = resolveAnalyzeVendorHints({
    selectedIds: [],
    heuristicVendors: heuristic,
  });
  assert.ok(resolved.vendorHints.includes("SAP Business One"));
  assert.ok(resolved.vendorHints.includes("SAP HANA"));
  const prompt = buildMariTicketAnalysisSystemPrompt(resolved.vendorHints, []);
  assert.doesNotMatch(prompt, /AUSGEWÄHLTE PRODUKTE/);
});

test("selected modules add manufacturer portals to the system prompt", () => {
  const modules = analyzeModulesFromIds(["sap-b1-sql", "coresuite"]);
  const prompt = buildMariTicketAnalysisSystemPrompt(
    modules.map((m) => m.vendorLabel),
    modules
  );
  assert.match(prompt, /AUSGEWÄHLTE PRODUKTE/);
  assert.match(prompt, /help\.sap\.com\/docs\/SAP_BUSINESS_ONE/);
  assert.match(prompt, /helpdesk\.coresystems\.ch/);
});

test("support todo title gets ticket prefix once", () => {
  assert.equal(
    formatSupportTodoTitle(4711, "HANA Trace prüfen"),
    "#4711 HANA Trace prüfen"
  );
  assert.equal(
    formatSupportTodoTitle(4711, "#4711 HANA Trace prüfen"),
    "#4711 HANA Trace prüfen"
  );
});

test("normalize fills support-todo fields", () => {
  const raw = normalizeMariTicketAnalysisInput({
    summary: "Lage: Fehler beim Buchen.",
    completeness: { score: 40, missing: ["DB-Typ"] },
    suggestedTasks: [
      { title: "TN auf Testfirma nachstellen", reason: "Screenshot zeigt TN" },
    ],
    suggestions: [],
  }) as {
    suggestedTasks: Array<{
      kind: string;
      confidence: string;
      title: string;
    }>;
  };
  assert.equal(raw.suggestedTasks[0]?.kind, "support_todo");
  assert.equal(raw.suggestedTasks[0]?.confidence, "medium");
  assert.equal(raw.suggestedTasks[0]?.title, "TN auf Testfirma nachstellen");
});

test("vendor heuristic finds HANA and SQL Server", () => {
  const found = detectRelevantVendorsFromTicketText(
    "Fehler in OCRD auf HANA; Kunde hat auch SQL Server"
  );
  assert.ok(found.includes("SAP Business One"));
  assert.ok(found.includes("SAP HANA"));
  assert.ok(found.includes("Microsoft SQL Server"));
});

test("groupSolutionArtifacts pairs HANA and SQL Server by purpose", () => {
  const groups = groupSolutionArtifacts([
    {
      kind: "sql_hana",
      title: "BP prüfen (HANA)",
      language: "sql-hana",
      code: 'SELECT "CardCode" FROM "OCRD"',
    },
    {
      kind: "sql_sqlserver",
      title: "BP prüfen (SQL Server)",
      language: "sql",
      code: "SELECT [CardCode] FROM [OCRD]",
    },
    {
      kind: "bash",
      title: "HANA Dienste",
      language: "bash",
      code: "HDB info",
    },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.type, "pair");
  if (groups[0]?.type === "pair") {
    assert.equal(groups[0].purpose, "BP prüfen");
    assert.match(groups[0].hana.code, /OCRD/);
    assert.match(groups[0].sqlserver.code, /\[OCRD\]/);
  }
  assert.equal(groups[1]?.type, "single");
});

test("parseIsoDueHint accepts only calendar dates", () => {
  assert.equal(parseIsoDueHint("2026-08-25"), "2026-08-25");
  assert.equal(parseIsoDueHint("heute"), null);
  assert.equal(parseIsoDueHint(null), null);
});

function timelineEntry(i: number, text: string) {
  return {
    side: i % 2 === 0 ? ("customer" as const) : ("support" as const),
    at: `2026-01-${String(i + 1).padStart(2, "0")}T08:00:00`,
    label: "Mail",
    actor: null,
    meta: null,
    subject: null,
    text,
  };
}

test("timeline block keeps the newest entries when the budget is tight", () => {
  const items = Array.from({ length: 12 }, (_, i) =>
    timelineEntry(i, `Eintrag-${i} ${"x".repeat(200)}`)
  );
  const block = buildTimelinePromptBlock(items, { maxChars: 900 });

  assert.ok(block.dropped > 0, "budget should have dropped older entries");
  assert.ok(block.included > 0, "newest entries must survive");
  assert.equal(block.included + block.dropped, items.length);
  // Der jüngste Eintrag ist der wichtigste — er darf nie wegfallen.
  assert.match(block.text, /Eintrag-11/);
  assert.doesNotMatch(block.text, /Eintrag-0\s/);
  assert.match(block.text, /ältere Verlaufseinträge wegen Platzbudget/);
});

test("timeline block keeps chronological order and drops nothing when it fits", () => {
  const items = [
    timelineEntry(0, "Kunde meldet Fehler"),
    timelineEntry(1, "Support fragt nach Beleg"),
    timelineEntry(2, "Kunde liefert Belegnummer 4711"),
  ];
  const block = buildTimelinePromptBlock(items, { maxChars: 32_000 });

  assert.equal(block.dropped, 0);
  assert.equal(block.included, 3);
  assert.doesNotMatch(block.text, /ausgelassen/);
  const first = block.text.indexOf("Kunde meldet Fehler");
  const last = block.text.indexOf("Belegnummer 4711");
  assert.ok(first >= 0 && last > first, "entries must stay chronological");
  assert.match(block.text, /\[Seite: Support \(wir\)\]/);
});

test("timeline entry text is clipped per entry, not silently dropped", () => {
  const block = buildTimelinePromptBlock(
    [timelineEntry(0, "A".repeat(5000))],
    { maxChars: 32_000, maxTextChars: 100 }
  );
  assert.equal(block.dropped, 0);
  assert.ok(block.text.length < 400);
  assert.match(block.text, /A{100}/);
});

test("system prompt demands specificity and history awareness", () => {
  const prompt = buildMariTicketAnalysisSystemPrompt(["SAP Business One"], []);
  assert.match(prompt, /SPEZIFISCH STATT GENERISCH/);
  assert.match(prompt, /NICHT BEI NULL ANFANGEN/);
  assert.match(prompt, /DOKUMENTE/);
  assert.match(prompt, /nextReplyDraft — INHALT/);
});
