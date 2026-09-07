import type {
  ExistingDayTaskRef,
  MsDayMailAnalysis,
  MsDayTaskSuggestion,
} from "@/lib/microsoft/analyze-mail-day";
import { stripTrailingSenderSuffix } from "@/lib/microsoft/analyze-mail-day";

export type { ExistingDayTaskRef };

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

const MIN_TITLE = 10;
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

function coreTitle(title: string): string {
  return normalizeText(stripTrailingSenderSuffix(title || ""));
}

function coreSubject(subject: string): string {
  return normalizeText(
    (subject || "").replace(/^(aw|re|wg|fwd|fw):\s*/gi, "")
  );
}

/** Gleicher Titel, oder einer ist der andere plus kurzer Absender-Rest. */
export function titlesAreSameTask(a: string, b: string): boolean {
  const na = coreTitle(a);
  const nb = coreTitle(b);
  if (na.length < MIN_TITLE || nb.length < MIN_TITLE) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (!long.includes(short)) return false;
  return short.length >= 20 && short.length / long.length >= 0.75;
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

export function isConfidentExistingTaskRef(
  suggestionTitle: string,
  existing?: ExistingDayTaskRef | null
): boolean {
  if (!existing?.id) return false;
  if (existing.match === "source") return true;
  return titlesAreSameTask(suggestionTitle, existing.title);
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
