import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeODataString,
  parseWebVttTranscript,
  previewText,
  stripGraphHtml,
} from "./teams-text.ts";

test("stripGraphHtml unwraps Teams HTML", () => {
  assert.equal(
    stripGraphHtml("<p>Bitte <b>senden</b></p><br>Danke&nbsp;schon"),
    "Bitte senden\n\nDanke schon"
  );
});

test("previewText ellipsizes without exploding", () => {
  assert.equal(previewText("kurz"), "kurz");
  assert.equal(previewText("x".repeat(90), 20).endsWith("…"), true);
});

test("parseWebVttTranscript keeps speaker lines", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Rolf Walker>Ich schicke die Offerte.

00:00:04.000 --> 00:00:08.000
<v Anna>Kannst du das Ticket updaten?
`;
  const text = parseWebVttTranscript(vtt);
  assert.match(text, /Rolf Walker: Ich schicke die Offerte/);
  assert.match(text, /Anna: Kannst du das Ticket updaten/);
});

test("escapeODataString doubles single quotes", () => {
  assert.equal(escapeODataString("a'b"), "a''b");
});
