import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

export const CALENDAR_RANGE_MAX_DAYS = 90;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarDateRange = {
  from: string;
  to: string;
  days: number;
};

export function isYmd(value: string | null | undefined): value is string {
  return Boolean(value && YMD.test(value));
}

export function inclusiveDayCount(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function parseCalendarDateRange(
  fromRaw: string | null,
  toRaw: string | null,
  today = zurichYmd()
): { ok: true; range: CalendarDateRange } | { ok: false; error: string } {
  const fromIn = fromRaw?.trim() || "";
  const toIn = toRaw?.trim() || "";

  if (fromIn && !isYmd(fromIn)) {
    return { ok: false, error: "Ungültiges from-Datum (YYYY-MM-DD)." };
  }
  if (toIn && !isYmd(toIn)) {
    return { ok: false, error: "Ungültiges to-Datum (YYYY-MM-DD)." };
  }

  const from = fromIn || today;
  const to = toIn || addDaysYmd(from, CALENDAR_RANGE_MAX_DAYS - 1);

  if (to < from) {
    return { ok: false, error: "to darf nicht vor from liegen." };
  }

  const days = inclusiveDayCount(from, to);
  if (days < 1 || days > CALENDAR_RANGE_MAX_DAYS) {
    return {
      ok: false,
      error: `Zeitraum höchstens ${CALENDAR_RANGE_MAX_DAYS} Tage (inkl.).`,
    };
  }

  return { ok: true, range: { from, to, days } };
}
