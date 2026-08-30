import { addDaysYmd } from "@/lib/microsoft/time";
import { mondayOfWeek } from "@/lib/presence/week";

export function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function addMonthsYmd(ymd: string, delta: number): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const dt = new Date(Date.UTC(year, month - 1 + delta, 1));
  const nextYear = dt.getUTCFullYear();
  const nextMonth = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}-01`;
}

export function sameCalendarMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Monday–Sunday cells covering the month of `ymd` (5 or 6 weeks). */
export function monthGridDays(ymd: string): string[] {
  const start = monthStartYmd(ymd);
  const monday = mondayOfWeek(start) || start;
  const days: string[] = [];
  for (let i = 0; i < 42; i++) days.push(addDaysYmd(monday, i));
  const month = start.slice(0, 7);
  while (days.length > 35) {
    const tail = days.slice(-7);
    if (tail.every((day) => day.slice(0, 7) !== month)) {
      days.splice(-7, 7);
      continue;
    }
    break;
  }
  return days;
}
