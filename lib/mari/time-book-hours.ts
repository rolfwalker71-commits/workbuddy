/**
 * Geleistet (MARI Stunden / `hours`) and Verrechenbar (MARI Fakt. / `hoursBillable`)
 * are independent 0–24 on POST (no cap). Form UX: Verrechenbar follows Geleistet
 * until the user edits Verrechenbar in this session (`billableDirty`).
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

/**
 * Session follow flag: Verrechenbar tracks Geleistet until the user edits it.
 * Opens following when both defaults match (new book / same split).
 * Edit with an existing split starts dirty so Geleistet does not overwrite billed.
 */
export function timeBookInitialBillableDirty(hours: {
  hours: number;
  hoursBillable: number;
}): boolean {
  return hours.hours !== hours.hoursBillable;
}

/**
 * After a Geleistet change: copy the raw value into Verrechenbar while
 * `billableDirty` is false. Changing Verrechenbar never writes Geleistet.
 */
export function timeBookFollowBillableRaw(
  workedRaw: string,
  currentBillableRaw: string,
  billableDirty: boolean
): string {
  return billableDirty ? currentBillableRaw : workedRaw;
}

export function formatBookHours(n: number): string {
  return n.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Verrechenbar / Geleistet as a rounded integer percent, or null if Geleistet is 0. */
export function bagelBillablePercent(
  worked: number,
  billable: number
): number | null {
  if (!Number.isFinite(worked) || !Number.isFinite(billable) || worked <= 0) {
    return null;
  }
  return Math.round((billable / worked) * 100);
}

/** Center label: `36%`, `125%`, or `—` when Geleistet is 0 (no ratio). */
export function formatBagelBillablePercent(
  worked: number,
  billable: number
): string {
  const pct = bagelBillablePercent(worked, billable);
  return pct == null ? "—" : `${pct}%`;
}

export function bagelHoursAriaLabel(
  worked: number,
  billable: number
): string {
  const hours = `Geleistet ${formatBookHours(worked)} h, verrechenbar ${formatBookHours(billable)} h`;
  const pct = formatBagelBillablePercent(worked, billable);
  return pct === "—" ? hours : `${hours}, ${pct}`;
}
