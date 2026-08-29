import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMariIssueCreateBody,
  DEFAULT_SUPPORT_PRODUCT_ID,
  joinMariContactPerson,
} from "@/lib/mari/create-issue";
import {
  formatMariImportFailure,
  mariIssueIdFromResult,
  shouldRetryMariCreateWithoutMedium,
} from "@/lib/mari/import-result";
import { NEW_STATUS_ID } from "@/lib/mari/status";
import { SUPPORT_HOTLINE_CLASS_TYPE } from "@/lib/mari/tickets";
import { normalizeMariEmail } from "@/lib/mari/customers";
import { excerptMailBody, parseMailSender } from "@/lib/mail/mail-contact";

test("normalizeMariEmail accepts a simple address", () => {
  assert.equal(normalizeMariEmail("  Anna@Firma.CH "), "anna@firma.ch");
  assert.equal(normalizeMariEmail("not-an-email"), null);
  assert.equal(normalizeMariEmail("a@b.c;drop"), null);
});

test("parseMailSender reads Outlook from / fromName", () => {
  assert.deepEqual(
    parseMailSender({
      from: "anna@firma.ch",
      fromName: "Anna Muster",
    }),
    { name: "Anna Muster", email: "anna@firma.ch" }
  );
  assert.deepEqual(
    parseMailSender({ from: "Anna Muster <anna@firma.ch>" }),
    { name: "Anna Muster", email: "anna@firma.ch" }
  );
});

test("excerptMailBody trims and caps", () => {
  assert.equal(excerptMailBody("  Hallo  "), "Hallo");
  assert.equal(excerptMailBody("x".repeat(10), null, 8), `${"x".repeat(8)}…`);
});

test("joinMariContactPerson matches Kopf «Name; E-Mail»", () => {
  assert.equal(
    joinMariContactPerson("Herr Lucas Castro", "lucas@firma.ch"),
    "Herr Lucas Castro; lucas@firma.ch"
  );
  assert.equal(joinMariContactPerson("", "lucas@firma.ch"), "lucas@firma.ch");
});

test("buildMariIssueCreateBody uses PATCH/GET field names", () => {
  const body = buildMariIssueCreateBody(
    {
      briefDescription: "Drucker klemmt",
      requestText: "Seit heute kein Papier.",
      contactPerson: "Anna; anna@firma.ch",
      cardCode: "C1000",
      projectNumber: "P200000",
      company: 2,
      contractId: 44,
      handledBy: "M1010",
    },
    {
      employeeNumber: "M1010",
      phaseId: 9,
      mediumId: 3,
    }
  );
  assert.equal(body.BriefDescription, "Drucker klemmt");
  assert.equal(body.Project, "P200000");
  assert.equal(body.Company, 2);
  assert.equal(body.BusinessPartnerCode, "C1000");
  assert.equal(body.ContractID, 44);
  assert.equal(body.ContactPerson, "Anna; anna@firma.ch");
  assert.equal(body.Status, NEW_STATUS_ID);
  assert.equal(body.ProductID, DEFAULT_SUPPORT_PRODUCT_ID);
  assert.equal(body.ParentType, 0);
  assert.equal(body.EditorType, 3);
  assert.equal(body.HotlineClassType, SUPPORT_HOTLINE_CLASS_TYPE);
  assert.equal(body.Responsible, "M1010");
  assert.equal(body.ResponsibleType, 3);
  assert.equal(body.PhaseID, 9);
  assert.equal(body.Medium, 3);
  assert.match(String(body.RequestText), /Seit heute kein Papier/);
  assert.equal("CardCode" in body, false);
});

test("buildMariIssueCreateBody keeps mail HTML and rejects missing company", () => {
  const body = buildMariIssueCreateBody(
    {
      briefDescription: "HTML Mail",
      requestText: "<p>Hallo</p><br />Text",
      requestIsHtml: true,
      projectNumber: "P200000",
      company: 1,
    },
    { employeeNumber: "M1010" }
  );
  assert.equal(body.RequestText, "<p>Hallo</p><br />Text");
  assert.equal(body.Company, 1);
  const asText = buildMariIssueCreateBody(
    {
      briefDescription: "Text",
      requestText: "Zeile 1\nZeile 2",
      requestIsHtml: false,
      projectNumber: "P200000",
      company: 1,
    },
    { employeeNumber: "M1010" }
  );
  assert.equal(asText.RequestText, "Zeile 1<br />Zeile 2");
  assert.throws(
    () =>
      buildMariIssueCreateBody(
        {
          briefDescription: "x",
          requestText: "y",
          projectNumber: "P200000",
          company: 0,
        },
        { employeeNumber: "M1010" }
      ),
    /Mandant/
  );
});

test("IMPORT_Feedback 2 with IssueID is success and must not retry", () => {
  const created = {
    IssueID: 144647,
    IMPORT_Feedback: 2,
    IMPORT_ErrorMessage: "",
  };
  assert.equal(mariIssueIdFromResult(created), 144647);
  assert.equal(shouldRetryMariCreateWithoutMedium(created, true), false);
  assert.equal(
    shouldRetryMariCreateWithoutMedium(
      { IMPORT_Feedback: 2, IMPORT_ErrorMessage: "" },
      true
    ),
    true
  );
  assert.equal(
    shouldRetryMariCreateWithoutMedium(
      { IMPORT_Feedback: 2, IssueID: 0 },
      false
    ),
    false
  );
});

test("formatMariImportFailure keeps feedback when message is empty", () => {
  const text = formatMariImportFailure(
    { IMPORT_Feedback: 2, IMPORT_ErrorMessage: "", IssueID: null },
    "MARI POST fehlgeschlagen",
    200
  );
  assert.match(text, /MARI POST fehlgeschlagen/);
  assert.match(text, /IMPORT_Feedback 2/);
  assert.match(text, /HTTP 200/);
});
