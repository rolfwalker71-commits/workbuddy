import { NEW_STATUS_ID } from "@/lib/mari/status";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

/** TTV sieht Status NEU von heute und gestern (Europe/Zurich). */
export const TTV_INBOX_STATUS_ID = NEW_STATUS_ID;
export const TTV_INBOX_LOOKBACK_DAYS = 1;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeYmd(raw: string | null | undefined): string | null {
  const v = (raw || "").trim().slice(0, 10);
  return YMD.test(v) ? v : null;
}

export function ttvInboxDateWindow(now = new Date()): {
  fromYmd: string;
  toYmd: string;
} {
  const toYmd = zurichYmd(now);
  return {
    fromYmd: addDaysYmd(toYmd, -TTV_INBOX_LOOKBACK_DAYS),
    toYmd,
  };
}
