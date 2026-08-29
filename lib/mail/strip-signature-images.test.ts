import assert from "node:assert/strict";
import test from "node:test";
import {
  contentIdFromSrc,
  filenameLooksLikeSignatureImage,
  initialMailTicketDescription,
  isTrackingOrTinyImage,
  stripOutlookSignatureImages,
} from "@/lib/mail/strip-signature-images";

test("contentIdFromSrc reads cid", () => {
  assert.equal(contentIdFromSrc("cid:image001.png@01"), "image001.png@01");
  assert.equal(contentIdFromSrc("https://x/y.png"), null);
});

test("filenameLooksLikeSignatureImage matches Outlook chrome", () => {
  assert.equal(filenameLooksLikeSignatureImage("image001.png"), true);
  assert.equal(filenameLooksLikeSignatureImage("signature-logo.gif"), true);
  assert.equal(filenameLooksLikeSignatureImage("Fehler-Screenshot.png"), false);
});

test("isTrackingOrTinyImage catches 1x1", () => {
  assert.equal(isTrackingOrTinyImage('width="1" height="1" src="x.gif"'), true);
  assert.equal(
    isTrackingOrTinyImage('src="x.png" style="width:1px;height:1px"'),
    true
  );
  assert.equal(
    isTrackingOrTinyImage('width="800" height="600" src="shot.png"'),
    false
  );
});

test("stripOutlookSignatureImages drops #Signature imgs, keeps text", () => {
  const html = `<div><p>Bitte prüfen.</p></div><div id="Signature"><p>Freundliche Grüsse</p><img src="cid:image001.png@01" /></div>`;
  const r = stripOutlookSignatureImages(html);
  assert.match(r.html, /Bitte prüfen/);
  assert.match(r.html, /Freundliche Grüsse/);
  assert.equal(/<img/i.test(r.html), false);
  assert.ok(r.removedCount >= 1);
  assert.ok(r.removedContentIds.some((c) => c.startsWith("image001")));
});

test("stripOutlookSignatureImages drops cid imgs after --", () => {
  const html = `<p>Hallo</p><br>--<br><img src="cid:logo@host" alt="logo" />`;
  const r = stripOutlookSignatureImages(html);
  assert.match(r.html, /Hallo/);
  assert.equal(/<img/i.test(r.html), false);
});

test("stripOutlookSignatureImages drops OutlookMessageSignature imgs", () => {
  const html = `<div>Text</div><div class="OutlookMessageSignature"><img src="https://cdn/logo.png" />Anna</div>`;
  const r = stripOutlookSignatureImages(html);
  assert.match(r.html, /Text/);
  assert.match(r.html, /Anna/);
  assert.equal(/<img/i.test(r.html), false);
});

test("initialMailTicketDescription prefers stripped HTML", () => {
  const r = initialMailTicketDescription({
    bodyHtml: `<p>Auftrag</p><div id="Signature"><img src="cid:x" /></div>`,
    bodyText: "Auftrag",
  });
  assert.equal(r.isHtml, true);
  assert.match(r.body, /Auftrag/);
  assert.equal(/<img/i.test(r.body), false);
});
