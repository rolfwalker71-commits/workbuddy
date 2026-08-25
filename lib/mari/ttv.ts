import { NEW_STATUS_ID } from "@/lib/mari/status";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

/** TTV sieht Status NEU im gewählten Kalenderfenster (Europe/Zurich). */
export const TTV_INBOX_STATUS_ID = NEW_STATUS_ID;
export const TTV_LOOKBACK_DAYS_MIN = 1;
export const TTV_LOOKBACK_DAYS_MAX = 14;
/** Heute plus Vortag — bisheriges TTV-Default. */
export const DEFAULT_TTV_LOOKBACK_DAYS = 2;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeYmd(raw: string | null | undefined): string | null {
  const v = (raw || "").trim().slice(0, 10);
  return YMD.test(v) ? v : null;
}

export function sanitizeTtvLookbackDays(raw: unknown): number | null {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < TTV_LOOKBACK_DAYS_MIN || n > TTV_LOOKBACK_DAYS_MAX) return null;
  return n;
}

/** Inclusive calendar days: 2 = today + yesterday. */
export function ttvInboxDateWindow(
  now = new Date(),
  lookbackDays: number = DEFAULT_TTV_LOOKBACK_DAYS
): {
  fromYmd: string;
  toYmd: string;
  lookbackDays: number;
} {
  const days =
    sanitizeTtvLookbackDays(lookbackDays) ?? DEFAULT_TTV_LOOKBACK_DAYS;
  const toYmd = zurichYmd(now);
  return {
    fromYmd: addDaysYmd(toYmd, -(days - 1)),
    toYmd,
    lookbackDays: days,
  };
}

export function ttvLookbackLabel(days: number): string {
  const n = sanitizeTtvLookbackDays(days) ?? DEFAULT_TTV_LOOKBACK_DAYS;
  if (n === 1) return "heute";
  return `letzte ${n} Tage`;
}
