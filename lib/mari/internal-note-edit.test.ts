import assert from "node:assert/strict";
import test from "node:test";
import { stripBuddyInternalNoteChrome } from "./internal-note-text.ts";

test("stripBuddyInternalNoteChrome removes Buddy wrappers", () => {
  const raw = [
    "Interner Kommentar",
    "Nur intern — nicht für den Kunden",
    "Ticket #144078",
    "",
    "Bitte Vertrag prüfen.",
    "",
    "Manuell aus Buddy · nur für internes Support-Personal sichtbar.",
  ].join("\n");
  assert.equal(stripBuddyInternalNoteChrome(raw), "Bitte Vertrag prüfen.");
});

test("stripBuddyInternalNoteChrome keeps analysis body", () => {
  const raw = [
    "Buddy AI-Analyse",
    "Nur intern — nicht für Kunden",
    "Zusammenfassung",
    "Drucker spinnt.",
    "Automatisch aus Buddy · nur für internes Support-Personal sichtbar.",
  ].join("\n");
  assert.equal(
    stripBuddyInternalNoteChrome(raw),
    "Zusammenfassung\nDrucker spinnt."
  );
});

test("stripBuddyInternalNoteChrome leaves plain Maringo notes alone", () => {
  assert.equal(
    stripBuddyInternalNoteChrome("Kurzer interner Hinweis."),
    "Kurzer interner Hinweis."
  );
});
