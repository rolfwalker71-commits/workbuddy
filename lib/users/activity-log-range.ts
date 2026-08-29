import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

/** Matches store retention (`ACTIVITY_LOG_RETENTION_DAYS`). */
export const ACTIVITY_LOG_MAX_DAYS = 60;
export const ACTIVITY_LOG_DEFAULT_WEEKS = 7;
export const ACTIVITY_LOG_PAGE_SIZE = 25;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isActivityYmd(
  value: string | null | undefined
): value is string {
  return Boolean(value && YMD.test(value));
}

export function activityLogRetentionFrom(today = zurichYmd()): string {
  return addDaysYmd(today, -(ACTIVITY_LOG_MAX_DAYS - 1));
}

/** Last 7 weeks through today (Europe/Zurich), not older than retention. */
export function activityLogDefaultRange(today = zurichYmd()): {
  from: string;
  to: string;
} {
  const to = today;
  const fromRaw = addDaysYmd(today, -(ACTIVITY_LOG_DEFAULT_WEEKS * 7));
  const floor = activityLogRetentionFrom(today);
  return { from: fromRaw < floor ? floor : fromRaw, to };
}

export function inclusiveYmdCount(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Inclusive YYYY-MM-DD window. Missing ends default to last 7 weeks.
 * Swaps inverted bounds, caps `to` at today, and clamps to 60 days / retention.
 */
export function clampActivityLogRange(input: {
  from?: string | null;
  to?: string | null;
  today?: string;
}): { from: string; to: string } | { error: string } {
  const today = input.today ?? zurichYmd();
  const defaults = activityLogDefaultRange(today);
  const floor = activityLogRetentionFrom(today);

  const fromIn = input.from?.trim() || "";
  const toIn = input.to?.trim() || "";

  if (fromIn && !isActivityYmd(fromIn)) {
    return { error: "Ungültiges from-Datum (YYYY-MM-DD)." };
  }
  if (toIn && !isActivityYmd(toIn)) {
    return { error: "Ungültiges to-Datum (YYYY-MM-DD)." };
  }

  let from = fromIn || defaults.from;
  let to = toIn || defaults.to;

  if (to < from) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  if (to > today) to = today;
  if (from < floor) from = floor;
  if (to < from) to = from;

  if (inclusiveYmdCount(from, to) > ACTIVITY_LOG_MAX_DAYS) {
    from = addDaysYmd(to, -(ACTIVITY_LOG_MAX_DAYS - 1));
    if (from < floor) from = floor;
  }

  return { from, to };
}
