import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPersonNames,
  matchBriefingItemToCluster,
  parseDaySummaryBriefing,
  stripDaySummaryMarkup,
} from "./day-summary-briefing.ts";

const prose =
  "Am 4. September 2026 stehen mehrere dringende Aufgaben im Vordergrund. Isabelle Steffen organisiert eine Begrüssung. Rolf Walker muss einen Termin koordinieren. Insgesamt ist eine klare Priorisierung nötig.";

test("parseDaySummaryBriefing splits cached prose into lead, bullets, close", () => {
  const blocks = parseDaySummaryBriefing(prose);
  assert.equal(blocks[0]?.type, "p");
  assert.equal(blocks[1]?.type, "ul");
  assert.equal(blocks[2]?.type, "p");
  if (blocks[1]?.type === "ul") {
    assert.equal(blocks[1].items.length, 2);
    assert.match(blocks[1].items[0]?.text || "", /Isabelle Steffen/);
  }
});

test("parseDaySummaryBriefing keeps markdown bullets and tags", () => {
  const blocks = parseDaySummaryBriefing(
    [
      "Lage ist angespannt.",
      "",
      "- **Isabelle Steffen** organisiert die Begrüssung. [Aufgabe]",
      "- Kick-off am Dienstag. [Termin]",
      "",
      "Priorisieren.",
    ].join("\n")
  );
  assert.equal(blocks[0]?.type, "p");
  assert.equal(blocks[1]?.type, "ul");
  assert.equal(blocks[2]?.type, "p");
  if (blocks[1]?.type === "ul") {
    assert.equal(blocks[1].items[0]?.kind, "task");
    assert.equal(blocks[1].items[1]?.kind, "event");
    assert.equal(blocks[1].items[0]?.text.includes("["), false);
  }
});

test("collectPersonNames finds full names and markdown singles", () => {
  const names = collectPersonNames(
    "**Norbert** braucht Accounts. Isabelle Steffen organisiert.",
    []
  );
  assert.ok(names.includes("Isabelle Steffen"));
  assert.ok(names.includes("Norbert"));
  assert.equal(
    names.some((n) => /Azure|SAP/i.test(n)),
    false
  );
});

test("matchBriefingItemToCluster prefers overlapping theme", () => {
  const match = matchBriefingItemToCluster(
    {
      text: "Birchmeier Migration Azure Termin koordinieren",
      kind: "task",
    },
    [
      {
        index: 0,
        company: "Intern",
        theme: "Stundenkontrolle",
        taskTitles: ["August prüfen"],
        eventTitles: [],
      },
      {
        index: 1,
        company: "Birchmeier",
        theme: "Migration Azure",
        taskTitles: ["Termin koordinieren"],
        eventTitles: [],
      },
    ]
  );
  assert.deepEqual(match, { kind: "task", clusterIndex: 1 });
});

test("stripDaySummaryMarkup is safe for list previews", () => {
  assert.equal(
    stripDaySummaryMarkup("- **Rolf Walker** prüft. [Aufgabe]"),
    "Rolf Walker prüft."
  );
});
