import { sanitizeYmd } from "@/lib/mari/ttv";

export function isAbsentOn(
  absence: { fromYmd: string; toYmd: string },
  ymd: string
): boolean {
  const day = sanitizeYmd(ymd);
  if (!day) return false;
  return day >= absence.fromYmd && day <= absence.toYmd;
}
