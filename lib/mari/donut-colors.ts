/** Ticket-status bagel palette (home overview). Hours bagels reuse the same tokens. */
export const MARI_DONUT_COLORS: Record<number, string> = {
  11: "#f43f5e",
  1: "#e86a2b",
  3: "#8b7cf6",
  13: "#22d3ee",
  6: "#eab308",
  9: "#f59e0b",
  7: "#a78bfa",
  10: "#c084fc",
  4: "#fb923c",
  14: "#ef4444",
  15: "#38bdf8",
  16: "#34d399",
};

export const MARI_DONUT_FALLBACK = [
  "#e86a2b",
  "#8b7cf6",
  "#eab308",
  "#38bdf8",
  "#34d399",
] as const;

export function mariDonutColor(statusId: number, index: number): string {
  return (
    MARI_DONUT_COLORS[statusId] ||
    MARI_DONUT_FALLBACK[index % MARI_DONUT_FALLBACK.length]!
  );
}

/** Verrechenbar share — ticket mint green (status 16 / fallback). */
export const HOURS_BAGEL_BILLABLE = MARI_DONUT_FALLBACK[4];

/** Remainder of Geleistet — ticket periwinkle (status 3 / fallback). */
export const HOURS_BAGEL_WORKED = MARI_DONUT_FALLBACK[1];

export const HOURS_BAGEL_EMPTY = "#e2e8f0";
