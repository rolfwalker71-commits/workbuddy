import assert from "node:assert/strict";
import test from "node:test";
import { buildMailDigestText } from "./mail-digest-text.ts";
import { selectReplyProbeCandidates } from "../mari/ticket-customer-reply.ts";

test("one mail is singular, several are plural", () => {
  const one = buildMailDigestText([
    { fromName: "Muster AG", from: "info@muster.ch" },
  ]);
  assert.equal(one.headline, "1 neue Mail");
  assert.equal(one.detail, "1 Absender · Muster AG");

  const many = buildMailDigestText([
    { fromName: "Muster AG", from: "info@muster.ch" },
    { fromName: "Hans Meier", from: "hans@meier.ch" },
    { fromName: "Anna Roth", from: "anna@roth.ch" },
  ]);
  assert.equal(many.headline, "3 neue Mails");
  assert.equal(many.detail, "3 Absender · Muster AG, Hans Meier, Anna Roth");
});

test("the same sender is counted once", () => {
  const text = buildMailDigestText([
    { fromName: "Muster AG", from: "info@muster.ch" },
    { fromName: "Muster AG", from: "INFO@muster.ch" },
    { fromName: "Hans Meier", from: "hans@meier.ch" },
  ]);
  assert.equal(text.headline, "3 neue Mails");
  assert.equal(text.detail, "2 Absender · Muster AG, Hans Meier");
});

test("more than three senders are summarised", () => {
  const text = buildMailDigestText(
    ["a", "b", "c", "d", "e"].map((x) => ({
      fromName: x.toUpperCase(),
      from: `${x}@x.ch`,
    }))
  );
  assert.equal(text.detail, "5 Absender · A, B, C, +2");
});

test("senders without a name do not produce an empty list", () => {
  const text = buildMailDigestText([{ fromName: "", from: "" }]);
  assert.equal(text.headline, "1 neue Mail");
  assert.equal(text.detail, "");
});

test("the reply probe only looks at tickets that actually moved", () => {
  const ids = selectReplyProbeCandidates([
    // unverändert → kein Kandidat
    {
      issueId: 1,
      changeAtDate: "2026-09-15T10:00:00",
      isNew: false,
      previousChangeAtDate: "2026-09-15T10:00:00",
    },
    // bewegt → Kandidat
    {
      issueId: 2,
      changeAtDate: "2026-09-16T08:00:00",
      isNew: false,
      previousChangeAtDate: "2026-09-15T10:00:00",
    },
    // neu → braucht keinen Vergleich
    {
      issueId: 3,
      changeAtDate: "2026-09-16T09:00:00",
      isNew: true,
      previousChangeAtDate: undefined,
    },
  ]);
  assert.deepEqual(ids, [2]);
});

test("the probe is capped and prefers the most recently changed", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    issueId: i + 1,
    changeAtDate: `2026-09-16T${String(i % 24).padStart(2, "0")}:00:00`,
    isNew: false,
    previousChangeAtDate: "2026-09-01T00:00:00",
  }));
  const ids = selectReplyProbeCandidates(many, 40);
  assert.equal(ids.length, 40);
  // Übersprungene behalten ihren alten Marker und bleiben nächste Runde dran.
  assert.equal(new Set(ids).size, 40);
});
