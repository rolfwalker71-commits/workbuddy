import assert from "node:assert/strict";
import test from "node:test";
import {
  detectRelevantVendorsFromTicketText,
  formatSupportTodoTitle,
  groupSolutionArtifacts,
  normalizeMariTicketAnalysisInput,
  parseIsoDueHint,
  specialistRoleLine,
} from "./analyze-ticket.ts";

test("specialist role names detected products", () => {
  assert.match(
    specialistRoleLine(["SAP Business One", "SAP HANA"]),
    /Spezialist für: SAP Business One, SAP HANA/
  );
  assert.match(specialistRoleLine([]), /kein Produktspezialist/i);
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
