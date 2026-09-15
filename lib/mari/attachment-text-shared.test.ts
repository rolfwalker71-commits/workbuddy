import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDocumentTextsForPrompt,
  isMariPdfAttachment,
  isMariReadableDocument,
  isMariTextAttachment,
  tidyExtractedText,
  type MariDocumentText,
} from "./attachment-text-shared.ts";

function doc(patch: Partial<MariDocumentText> = {}): MariDocumentText {
  return {
    attachmentId: 1,
    orgFilename: "protokoll.pdf",
    mimeType: "application/pdf",
    byteLength: 1234,
    text: "Fehler 0x8004 beim Buchen",
    pageCount: 2,
    pagesRead: 2,
    needsOcr: false,
    truncated: false,
    ...patch,
  };
}

test("pdf detection falls back to the filename when MIME is generic", () => {
  assert.ok(isMariPdfAttachment("application/pdf", "x"));
  assert.ok(isMariPdfAttachment("application/octet-stream", "Rechnung.PDF"));
  assert.ok(!isMariPdfAttachment("image/png", "screenshot.png"));
});

test("text attachments are recognised by MIME or extension", () => {
  assert.ok(isMariTextAttachment("text/plain", "a.txt"));
  assert.ok(isMariTextAttachment("application/octet-stream", "trace.log"));
  assert.ok(isMariTextAttachment("application/octet-stream", "export.csv"));
  assert.ok(!isMariTextAttachment("application/octet-stream", "mappe.xlsx"));
});

test("readable documents cover pdf and text, not arbitrary binaries", () => {
  assert.ok(isMariReadableDocument("application/pdf", "a.pdf"));
  assert.ok(isMariReadableDocument("text/plain", "a.txt"));
  assert.ok(!isMariReadableDocument("application/vnd.ms-outlook", "mail.msg"));
  assert.ok(!isMariReadableDocument("application/zip", "logs.zip"));
});

test("tidyExtractedText collapses pdf whitespace noise", () => {
  assert.equal(
    tidyExtractedText("Fehler \u00a0 beim\r\n\r\n\r\nBuchen   "),
    "Fehler beim\n\nBuchen"
  );
});

test("document prompt block carries filename and page info", () => {
  const block = formatDocumentTextsForPrompt([doc()]);
  assert.match(block, /\[Dokument 1\] protokoll\.pdf · 2 Seite\(n\)/);
  assert.match(block, /Fehler 0x8004 beim Buchen/);
  assert.doesNotMatch(block, /INHALT UNBEKANNT/);
});

test("scanned pdf is flagged as unknown instead of being left blank", () => {
  const block = formatDocumentTextsForPrompt([
    doc({ text: "", needsOcr: true }),
  ]);
  assert.match(block, /INHALT UNBEKANNT/);
  assert.match(block, /ohne Textlayer/);
  assert.match(block, /Nicht raten/);
});

test("partially read document says so", () => {
  const block = formatDocumentTextsForPrompt([
    doc({ pageCount: 40, pagesRead: 25, truncated: true }),
  ]);
  assert.match(block, /40 Seite\(n\), davon 25 gelesen/);
  assert.match(block, /Dokument gekürzt/);
});

test("no documents means no prompt block at all", () => {
  assert.equal(formatDocumentTextsForPrompt([]), "");
});
