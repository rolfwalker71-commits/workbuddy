import {
  addDaysYmd,
  resolveTimePeriodRange,
} from "@/lib/mari/timekeeping-shared";

/** Inclusive calendar-day span (from…to) and occurrence caps before a series starts. */
export const SERIES_MAX_SPAN_DAYS = 90;
export const SERIES_MAX_OCCURRENCES = 52;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type SeriesWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ExpandSeriesDatesError =
  | "invalid-from"
  | "invalid-to"
  | "range-inverted"
  | "span-cap"
  | "count-cap";

export type ExpandSeriesDatesResult =
  | { ok: true; dates: string[] }
  | { ok: false; error: ExpandSeriesDatesError };

function parseUtcYmd(ymd: string): Date | null {
  if (!YMD.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

function formatUtcYmd(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** ISO weekday for a UTC calendar day: Mon=1 … Sun=7. */
export function isoWeekdayUtc(ymd: string): SeriesWeekday | null {
  const dt = parseUtcYmd(ymd);
  if (!dt) return null;
  const sun0 = dt.getUTCDay();
  return (sun0 === 0 ? 7 : sun0) as SeriesWeekday;
}

/** Monday–Sunday of the ISO week that contains `anchorYmd`. */
export function seriesWeekRange(
  anchorYmd: string
): { from: string; to: string } | null {
  try {
    const range = resolveTimePeriodRange(anchorYmd, "week");
    return { from: range.fromDate, to: range.toDate };
  } catch {
    return null;
  }
}

/** Last calendar day of the month that contains `ymd`. */
export function seriesMonthEnd(ymd: string): string | null {
  try {
    return resolveTimePeriodRange(ymd, "month").toDate;
  } catch {
    return null;
  }
}

/**
 * Expand `from`…`to` (inclusive, UTC calendar days) to dates whose ISO weekday
 * is in `weekdays` (Mon=1 … Sun=7). Empty weekday selection yields no dates.
 * Errors before start when the span exceeds 90 days or more than 52 dates match.
 */
export function expandSeriesDates(input: {
  from: string;
  to: string;
  weekdays: readonly number[];
}): ExpandSeriesDatesResult {
  const fromDt = parseUtcYmd(input.from);
  if (!fromDt) return { ok: false, error: "invalid-from" };
  const toDt = parseUtcYmd(input.to);
  if (!toDt) return { ok: false, error: "invalid-to" };
  if (toDt.getTime() < fromDt.getTime()) {
    return { ok: false, error: "range-inverted" };
  }

  const spanDays =
    Math.round((toDt.getTime() - fromDt.getTime()) / 86_400_000) + 1;
  if (spanDays > SERIES_MAX_SPAN_DAYS) {
    return { ok: false, error: "span-cap" };
  }

  const wanted = new Set<number>();
  for (const w of input.weekdays) {
    if (Number.isInteger(w) && w >= 1 && w <= 7) wanted.add(w);
  }

  const dates: string[] = [];
  if (wanted.size === 0) {
    return { ok: true, dates };
  }

  let cursor = formatUtcYmd(fromDt);
  for (let i = 0; i < spanDays; i++) {
    const wd = isoWeekdayUtc(cursor);
    if (wd != null && wanted.has(wd)) {
      dates.push(cursor);
      if (dates.length > SERIES_MAX_OCCURRENCES) {
        return { ok: false, error: "count-cap" };
      }
    }
    if (i < spanDays - 1) cursor = addDaysYmd(cursor, 1);
  }

  return { ok: true, dates };
}
