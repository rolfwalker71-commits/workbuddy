/**
 * Sorting for the booked-hours table. Only the project column is sortable so
 * far; `null` keeps whatever order Maringo returned (by time within the day),
 * which is the useful default for a single day.
 */

import type { MariTimeLine } from "@/lib/mari/timekeeping-shared";

export type TimeLinesSort = "project-asc" | "project-desc" | null;

/** asc → desc → off, so a click can always get back to Maringo's order. */
export function nextTimeLinesSort(current: TimeLinesSort): TimeLinesSort {
  if (current === "project-asc") return "project-desc";
  if (current === "project-desc") return null;
  return "project-asc";
}

/**
 * Project numbers look like P200000 / P600143, so compare them naturally
 * rather than by character. Lines without a number sort last either way —
 * they are the ones still missing their labels.
 */
export function compareMariProjectNumbers(a: string, b: string): number {
  const left = a.trim();
  const right = b.trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, "de-CH", {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortMariTimeLines(
  lines: readonly MariTimeLine[],
  sort: TimeLinesSort
): MariTimeLine[] {
  if (!sort) return [...lines];
  const dir = sort === "project-desc" ? -1 : 1;
  return [...lines].sort((a, b) => {
    const left = a.projectNumber.trim();
    const right = b.projectNumber.trim();
    // Outside the direction flip on purpose: a line without a number trails
    // in both directions instead of jumping to the top on descending.
    if (Boolean(left) !== Boolean(right)) return left ? -1 : 1;
    const byProject = compareMariProjectNumbers(left, right) * dir;
    if (byProject !== 0) return byProject;
    // Stable within a project: keep the day order, then the line id.
    const byDate = a.serviceDate.localeCompare(b.serviceDate);
    if (byDate !== 0) return byDate;
    return a.lineId - b.lineId;
  });
}
