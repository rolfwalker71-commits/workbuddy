import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDaySummaryBriefing,
  daySummaryTextParts,
  matchDaySummaryChips,
  parseBulletDeadline,
  parseDaySummaryStructure,
  plainDaySummaryPreview,
} from "./day-summary-display.ts";

const prose =
  "Am 4. September 2026 stehen mehrere dringende Aufgaben im Vordergrund. Isabelle Steffen organisiert für nächsten Dienstag einen Empfang für Santosh. Das Angebot Birchmeier Migration Azure ist angenommen.";

test("parseDaySummaryStructure splits prose into intro and thoughts", () => {
  const parsed = parseDaySummaryStructure(prose);
  assert.equal(
    parsed.intro?.startsWith("Am 4. September 2026"),
    true
  );
  assert.equal(parsed.items.length, 2);
  assert.match(parsed.items[0], /Isabelle Steffen/);
});

test("parseDaySummaryStructure keeps markdown bullets", () => {
  const parsed = parseDaySummaryStructure(
    "Kurze Lage.\n- Erster Gedanke zu **Rolf Walker**.\n- Zweiter Gedanke."
  );
  assert.equal(parsed.intro, "Kurze Lage.");
  assert.deepEqual(parsed.items, [
    "Erster Gedanke zu **Rolf Walker**.",
    "Zweiter Gedanke.",
  ]);
});

test("daySummaryTextParts bolds full names and names after für", () => {
  const parts = daySummaryTextParts(
    "Isabelle Steffen organisiert einen Empfang für Santosh."
  );
  const bold = parts.filter((p) => p.bold).map((p) => p.text);
  assert.ok(bold.includes("Isabelle Steffen"));
  assert.ok(bold.includes("Santosh"));
});

test("daySummaryTextParts keeps markdown bold and skips weekdays", () => {
  const parts = daySummaryTextParts(
    "Am Dienstag spricht **Norbert** über Azure."
  );
  const bold = parts.filter((p) => p.bold).map((p) => p.text);
  assert.deepEqual(bold, ["Norbert"]);
});

test("matchDaySummaryChips attaches task and mail from the matching cluster", () => {
  const chips = matchDaySummaryChips(
    "Das Angebot Birchmeier Migration Azure ist angenommen, Rolf Walker koordiniert den Termin.",
    [
      {
        company: "Birchmeier",
        theme: "Migration Azure",
        summary: "Angebot angenommen",
        tasks: [{ title: "Termin mit Birchmeier setzen" }],
        events: [],
        replies: [{ subject: "Re: Angebot Azure" }],
      },
      {
        company: "Trafag",
        theme: "vSphere",
        tasks: [],
        events: [],
        replies: [],
      },
    ]
  );
  assert.deepEqual(chips, {
    task: true,
    event: false,
    mail: true,
    urgent: false,
    customer: "Birchmeier",
    deadline: null,
  });
});

test("parseBulletDeadline reads numeric and named German dates", () => {
  assert.equal(parseBulletDeadline("bis zum 15.09. für MARINGO"), "15.09.");
  assert.equal(parseBulletDeadline("Meeting am 15. September 2026"), "15.09.2026");
  assert.equal(parseBulletDeadline("kein Datum im Text"), null);
});

test("matchDaySummaryChips adds urgent, customer, and cluster deadline", () => {
  const chips = matchDaySummaryChips("Norbert braucht den Zugang in MARINGO.", [
    {
      company: "AN Group",
      theme: "MARINGO Zugang",
      status: "open",
      tasks: [{ title: "User anlegen", dueDate: "2026-09-15" }],
    },
  ]);
  assert.equal(chips.urgent, true);
  assert.equal(chips.customer, "AN Group");
  assert.equal(chips.deadline, "15.09.2026");
  assert.equal(chips.task, true);
});

test("buildDaySummaryBriefing wires chips onto bullets", () => {
  const model = buildDaySummaryBriefing(
    "Lage knapp.\n- Birchmeier Migration muss terminiert werden.",
    [
      {
        company: "Birchmeier",
        theme: "Migration",
        events: [{ title: "Kickoff" }],
      },
    ]
  );
  assert.equal(model.intro, "Lage knapp.");
  assert.equal(model.bullets[0]?.chips.event, true);
  assert.equal(model.bullets[0]?.chips.task, false);
});

test("plainDaySummaryPreview strips markdown for list cards", () => {
  assert.equal(
    plainDaySummaryPreview("- **Rolf Walker** soll den Termin setzen.", 80),
    "Rolf Walker soll den Termin setzen."
  );
});
