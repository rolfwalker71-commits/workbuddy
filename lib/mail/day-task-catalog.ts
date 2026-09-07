import {
  isConfidentExistingTaskRef,
  titlesAreSameTask,
} from "@/lib/mail/day-task-match";
import type {
  ExistingDayTaskRef,
  MsDayMailAnalysis,
  MsDayTaskSuggestion,
} from "@/lib/microsoft/analyze-mail-day";

export type { ExistingDayTaskRef };
export { isConfidentExistingTaskRef, titlesAreSameTask };

/** Eigene Aufgabe aus Google Tasks / Outlook To Do / Planner. */
export type DayTaskCatalogItem = {
  id: string;
  title: string;
  notes: string | null;
  status: "open" | "done";
  doneAt: string | null;
  href: string | null;
  source?: "todo" | "planner" | "google";
};

const MIN_SUBJECT = 12;

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\u00df/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9äöü\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coreSubject(subject: string): string {
  return normalizeText(
    (subject || "").replace(/^(aw|re|wg|fwd|fw):\s*/gi, "")
  );
}

function isBuddyCreated(notes: string | null | undefined): boolean {
  return /mail-analyse \(buddy\)|tagesanalyse \(buddy\)/i.test(notes || "");
}

function notesPointToSource(
  notes: string | null | undefined,
  suggestion: MsDayTaskSuggestion
): boolean {
  const raw = notes || "";
  const hay = normalizeText(raw);
  if (!hay) return false;
  const mailId = (suggestion.sourceMailId || "").trim();
  if (mailId.length >= 8 && raw.includes(mailId)) return true;
  const subject = coreSubject(suggestion.sourceSubject || "");
  if (subject.length < MIN_SUBJECT) return false;
  if (!hay.includes(subject)) return false;
  // Betreff in Notizen nur zählen, wenn Buddy die Aufgabe angelegt hat.
  return isBuddyCreated(raw);
}

export function matchExistingDayTask(
  suggestion: MsDayTaskSuggestion,
  catalog: DayTaskCatalogItem[],
  usedIds?: Set<string>
): ExistingDayTaskRef | null {
  let best: { item: DayTaskCatalogItem; match: ExistingDayTaskRef["match"] } | null =
    null;
  for (const item of catalog) {
    if (usedIds?.has(item.id)) continue;
    const sameTitle = titlesAreSameTask(suggestion.title || "", item.title);
    const fromSource = notesPointToSource(item.notes, suggestion);
    if (!sameTitle && !fromSource) continue;
    const match: ExistingDayTaskRef["match"] = fromSource ? "source" : "title";
    if (!best) {
      best = { item, match };
      continue;
    }
    if (fromSource && best.match !== "source") {
      best = { item, match };
    }
  }
  if (!best) return null;
  return {
    id: best.item.id,
    title: best.item.title,
    status: best.item.status,
    doneAt: best.item.doneAt,
    href: best.item.href,
    match: best.match,
    source: best.item.source || null,
  };
}

/** Reichert Analyse-Tasks nur mit harten Treffern aus eigenen Listen an. */
export function attachExistingTasksToAnalysis(
  analysis: MsDayMailAnalysis,
  catalog: DayTaskCatalogItem[]
): MsDayMailAnalysis {
  if (!catalog.length) return analysis;
  const used = new Set<string>();

  const enrichTask = (t: MsDayTaskSuggestion): MsDayTaskSuggestion => {
    const hit = matchExistingDayTask(t, catalog, used);
    if (!hit) return { ...t, existingTask: null };
    used.add(hit.id);
    return { ...t, existingTask: hit };
  };

  const clusters = (analysis.clusters || []).map((c) => ({
    ...c,
    tasks: (c.tasks || []).map(enrichTask),
  }));
  const tasks = clusters.flatMap((c) => c.tasks);

  return {
    ...analysis,
    clusters,
    tasks,
  };
}
