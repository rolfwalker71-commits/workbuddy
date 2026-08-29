/** Client-safe MARI overtime (Überstunden) helpers — no Node/SQLite. */

/** MARI period 2026008 = August 2026 (year * 1000 + month). */
export function mariPeriodFromYmd(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error("Datum ungültig (YYYY-MM-DD).");
  }
  return y * 1000 + m;
}

/** First calendar day of a MARI period (2026001 → 2026-01-01). */
export function mariPeriodStartYmd(period: number): string {
  if (!Number.isInteger(period) || period < 1900001) {
    throw new Error("MARI-Periode ungültig.");
  }
  const y = Math.floor(period / 1000);
  const m = period % 1000;
  if (m < 1 || m > 12) throw new Error("MARI-Periode ungültig.");
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

export type MariOvertimeDayInput = {
  targetHours: number;
  bookedHours: number;
};

/**
 * Maringo Tag-grid Überstunden: running saldo after each day.
 * `start + Σ(project Quantity − calendar WorkHours)` from the employee
 * period start through the last day (inclusive).
 */
export function runningOvertimeHours(
  startValue: number,
  days: readonly MariOvertimeDayInput[]
): number {
  let acc = Number(startValue) || 0;
  for (const d of days) {
    acc += (Number(d.bookedHours) || 0) - (Number(d.targetHours) || 0);
  }
  return Math.round(acc * 100) / 100;
}

/** Same sign/decimals as Maringo (−4.85), de-CH grouping. */
export function formatOvertimeHours(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const abs = Math.abs(rounded).toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (rounded < 0) return `\u2212${abs}`;
  return abs;
}
