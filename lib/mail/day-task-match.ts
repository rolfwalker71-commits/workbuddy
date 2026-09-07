/** Trailing (Kürzel) oder Absender-Suffix entfernen. */
export function stripTrailingSenderSuffix(title: string): string {
  return title
    .replace(/\s*\([A-Za-zÀ-ÿÄÖÜäöü .'-]{1,60}\)\s*$/u, "")
    .trim();
}

const MIN_TITLE = 10;

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

export type ExistingTaskMatchRef = {
  id: string;
  title: string;
  match?: "title" | "theme" | "notes" | "source" | null;
};

export function isConfidentExistingTaskRef(
  suggestionTitle: string,
  existing?: ExistingTaskMatchRef | null
): boolean {
  if (!existing?.id) return false;
  if (existing.match === "source") return true;
  return titlesAreSameTask(suggestionTitle, existing.title);
}
