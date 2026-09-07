import assert from "node:assert/strict";
import test from "node:test";
import {
  isConfidentExistingTaskRef,
  matchExistingDayTask,
  titlesAreSameTask,
  type DayTaskCatalogItem,
} from "./day-task-catalog.ts";

const mine: DayTaskCatalogItem = {
  id: "t1",
  title: "SLA Dokumentation mit Meikel klären und angepasstes SLA erstellen",
  notes: "Übernommen aus Microsoft 365 Mail-Analyse (Buddy)\nQuelle Mail: SLA Vorlage",
  status: "done",
  doneAt: "2026-09-05T10:00:00Z",
  href: "https://to-do.office.com/tasks/",
  source: "todo",
};

test("titlesAreSameTask ignores the sender suffix and rejects loose overlap", () => {
  assert.equal(
    titlesAreSameTask(
      "SLA Dokumentation mit Meikel klären und angepasstes SLA erstellen (Norbert Pulliam)",
      "SLA Dokumentation mit Meikel klären und angepasstes SLA erstellen"
    ),
    true
  );
  assert.equal(
    titlesAreSameTask("Weitere Rückmeldungen einholen", "Weitere Infos zu Azure"),
    false
  );
  assert.equal(titlesAreSameTask("SLA", "SLA Dokumentation erstellen"), false);
});

test("matchExistingDayTask needs the same title or a Buddy source mail", () => {
  const hit = matchExistingDayTask(
    {
      title:
        "SLA Dokumentation mit Meikel klären und angepasstes SLA erstellen (Norbert Pulliam)",
      sourceSubject: "SLA Vorlage",
    },
    [mine]
  );
  assert.equal(hit?.id, "t1");
  assert.equal(hit?.status, "done");
  assert.equal(hit?.source, "todo");
});

test("matchExistingDayTask ignores a loosely related done task", () => {
  const hit = matchExistingDayTask(
    {
      title: "Weitere Rückmeldungen von Isabelle einholen (Isabelle Steffen)",
      theme: "An-Group",
      company: "An-Group",
    },
    [
      {
        id: "other",
        title: "An-Group Infoboard prüfen",
        notes: "Plan: ANG CH\nThema intern",
        status: "done",
        doneAt: "2026-09-01T00:00:00Z",
        href: null,
        source: "planner",
      },
    ]
  );
  assert.equal(hit, null);
});

test("isConfidentExistingTaskRef hides old loose theme hits", () => {
  assert.equal(
    isConfidentExistingTaskRef("Weitere Rückmeldungen einholen", {
      id: "old",
      title: "An-Group Infoboard",
      status: "done",
      match: "theme",
    }),
    false
  );
  assert.equal(
    isConfidentExistingTaskRef(
      "SLA Dokumentation mit Meikel klären und angepasstes SLA erstellen (Norbert)",
      {
        id: "ok",
        title: "SLA Dokumentation mit Meikel klären und angepasstes SLA erstellen",
        status: "done",
        match: "title",
      }
    ),
    true
  );
});

test("matchExistingDayTask does not use a foreign note that merely mentions the subject", () => {
  const hit = matchExistingDayTask(
    {
      title: "Angebot nachfassen (Hubert Suchy)",
      sourceSubject: "Angebot Birchmeier",
    },
    [
      {
        id: "foreign",
        title: "Wochenplanung",
        notes: "Bitte Angebot Birchmeier im Daily erwähnen",
        status: "open",
        doneAt: null,
        href: null,
        source: "todo",
      },
    ]
  );
  assert.equal(hit, null);
});
