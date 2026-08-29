/**
 * Geleistet (MARI Stunden / `hours`) and Verrechenbar (MARI Fakt. / `hoursBillable`)
 * are independent 0–24. Defaults match; editing one must not change the other.
 */

export function roundBookHours(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseBookHours(raw: string): number | null {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return roundBookHours(n);
}

export function isValidBookHours(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 24;
}

/** Prefill both the same unless `hoursBillable` is explicitly set (edit / stamp). */
export function timeBookHoursFromDefaults(defaults?: {
  hours?: number;
  hoursBillable?: number;
} | null): { hours: number; hoursBillable: number } {
  const hours =
    defaults?.hours != null && Number.isFinite(defaults.hours)
      ? roundBookHours(Math.max(0, defaults.hours))
      : 0.25;
  const hoursBillable =
    defaults?.hoursBillable != null && Number.isFinite(defaults.hoursBillable)
      ? roundBookHours(Math.max(0, defaults.hoursBillable))
      : hours;
  return { hours, hoursBillable };
}

/** POST body fields — no cap hoursBillable ≤ hours. */
export function timeBookPostHours(
  hours: number,
  hoursBillable: number
): { hours: number; hoursBillable: number } {
  return {
    hours: roundBookHours(hours),
    hoursBillable: roundBookHours(hoursBillable),
  };
}

export function formatBookHours(n: number): string {
  return n.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function bagelHoursAriaLabel(
  worked: number,
  billable: number
): string {
  return `Geleistet ${formatBookHours(worked)} h, verrechenbar ${formatBookHours(billable)} h`;
}
