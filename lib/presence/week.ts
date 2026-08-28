import { addDaysYmd } from "@/lib/microsoft/time";
import { sanitizeYmd } from "@/lib/mari/ttv";

export function mondayOfWeek(ymd: string): string | null {
  const day = sanitizeYmd(ymd);
  if (!day) return null;
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(day, mondayOffset);
}

/** Monday–Friday of the week that contains `ymd` (Europe/Zurich calendar via YYYY-MM-DD). */
export function weekdaysMonFri(ymd: string): string[] | null {
  const monday = mondayOfWeek(ymd);
  if (!monday) return null;
  return [0, 1, 2, 3, 4].map((i) => addDaysYmd(monday, i));
}
