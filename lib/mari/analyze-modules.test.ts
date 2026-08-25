import assert from "node:assert/strict";
import test from "node:test";
import {
  manufacturerSourcesPrompt,
  parseAnalyzeModuleIds,
  resolveAnalyzeVendorHints,
} from "./analyze-modules.ts";
import {
  buildVendorDocSearchQuery,
  formatVendorDocHitsForPrompt,
  htmlToPlain,
} from "./analyze-vendor-docs.ts";

test("parseAnalyzeModuleIds keeps catalog order and drops unknown", () => {
  assert.deepEqual(
    parseAnalyzeModuleIds(["hana", "unknown", "sap-b1-sql", "hana"]),
    ["sap-b1-sql", "hana"]
  );
  assert.deepEqual(parseAnalyzeModuleIds(null), []);
  assert.deepEqual(parseAnalyzeModuleIds("sap-b1-sql"), []);
});

test("empty module selection keeps heuristic vendors", () => {
  const heuristic = ["SAP Business One", "SAP HANA"];
  const resolved = resolveAnalyzeVendorHints({
    selectedIds: [],
    heuristicVendors: heuristic,
  });
  assert.equal(resolved.selected.length, 0);
  assert.deepEqual(resolved.vendorHints, heuristic);
});

test("selected modules replace the heuristic", () => {
  const resolved = resolveAnalyzeVendorHints({
    selectedIds: ["coresuite", "sap-b1-sql"],
    heuristicVendors: ["Microsoft 365"],
  });
  assert.deepEqual(
    resolved.vendorHints,
    ["SAP Business One (SQL Server)", "Coresystems coresuite"]
  );
  assert.match(
    manufacturerSourcesPrompt(resolved.selected),
    /help\.sap\.com\/docs\/SAP_BUSINESS_ONE\?locale=en-US/
  );
  assert.match(
    manufacturerSourcesPrompt(resolved.selected),
    /helpdesk\.coresystems\.ch/
  );
});

test("SAP HANA portal is the HANA product help", () => {
  const resolved = resolveAnalyzeVendorHints({
    selectedIds: ["sap-b1-hana"],
    heuristicVendors: [],
  });
  assert.match(
    manufacturerSourcesPrompt(resolved.selected),
    /SAP_BUSINESS_ONE_VERSION_FOR_SAP_HANA/
  );
});

test("vendor search query prefers subject and keeps B1 tables", () => {
  const q = buildVendorDocSearchQuery({
    briefDescription: "TN blockiert Rechnung",
    requestText: "Fehler in SBO_SP_TransactionNotification auf OINV",
  });
  assert.match(q, /TN blockiert Rechnung/);
  assert.match(q, /OINV/);
  assert.match(q, /SBO_SP_TransactionNotification/);
});

test("vendor doc hits stay empty without results", () => {
  assert.equal(formatVendorDocHitsForPrompt([]), "");
  assert.match(
    formatVendorDocHitsForPrompt([
      {
        source: "SAP Business One (SQL)",
        title: "Enable Transaction Notification",
        url: "https://help.sap.com/docs/SAP_BUSINESS_ONE/x",
        snippet: "This checkbox is selected by default.",
      },
    ]),
    /Enable Transaction Notification/
  );
});

test("vendor doc prompt prefers the full section over the snippet", () => {
  const text = formatVendorDocHitsForPrompt([
    {
      source: "SAP Business One (SQL)",
      title: "Transaction Notification",
      url: "https://help.sap.com/docs/SAP_BUSINESS_ONE/x",
      snippet: "kurz",
      section: "To enable the stored procedure, select the checkbox.",
    },
  ]);
  assert.match(text, /To enable the stored procedure/);
  assert.doesNotMatch(text, /\n  kurz\n/);
});

test("htmlToPlain keeps readable article text", () => {
  const plain = htmlToPlain(
    "<h1>Backup</h1><p>Stop the <b>server</b>.</p><script>x()</script>"
  );
  assert.match(plain, /Backup/);
  assert.match(plain, /Stop the server/);
  assert.doesNotMatch(plain, /script|x\(\)/);
});
