import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";
import { sanitizeYmd } from "@/lib/mari/ttv";

/** Non-admins may claim today or tomorrow. */
export function isClaimableYmd(ymd: string, today = zurichYmd()): boolean {
  const day = sanitizeYmd(ymd);
  if (!day) return false;
  return day === today || day === addDaysYmd(today, 1);
}

export function weekRangeFrom(ymd: string): { fromYmd: string; toYmd: string } {
  const day = sanitizeYmd(ymd) || zurichYmd();
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const fromYmd = addDaysYmd(day, mondayOffset);
  return { fromYmd, toYmd: addDaysYmd(fromYmd, 6) };
}
