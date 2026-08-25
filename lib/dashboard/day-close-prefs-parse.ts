/** Client-safe parse for the per-user virtual Tagesabschluss clock. */

export const DEFAULT_DAY_CLOSE_START_HM = "18:30";
export const DAY_CLOSE_DURATION_MINUTES = 15;
export const DAY_CLOSE_EARLIEST_HM = "06:00";
export const DAY_CLOSE_LATEST_HM = "22:00";

export type DayCloseSchedule = {
  startHm: string;
  endHm: string;
};

function hmParts(raw: string): { hour: number; minute: number } | null {
  const padded = /^(\d{1,2}):([0-5]\d)$/.exec((raw || "").trim());
  if (!padded) return null;
  const hour = Number(padded[1]);
  const minute = Number(padded[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return { hour, minute };
}

function formatHm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function dayCloseSettingKey(userId: number): string {
  return `day_close_time_u${userId}`;
}

export function hmToMinutes(hm: string): number {
  const parts = hmParts(hm) || hmParts(DEFAULT_DAY_CLOSE_START_HM)!;
  return parts.hour * 60 + parts.minute;
}

export function clampDayCloseStartHm(hm: string): string {
  const parts = hmParts(hm);
  if (!parts) return DEFAULT_DAY_CLOSE_START_HM;
  const mins = parts.hour * 60 + parts.minute;
  const earliest = hmToMinutes(DAY_CLOSE_EARLIEST_HM);
  const latest = hmToMinutes(DAY_CLOSE_LATEST_HM);
  if (mins < earliest) return DAY_CLOSE_EARLIEST_HM;
  if (mins > latest) return DAY_CLOSE_LATEST_HM;
  return formatHm(parts.hour, parts.minute);
}

export function parseDayCloseStartHm(raw: string | null | undefined): string {
  const parts = hmParts(raw || "");
  if (!parts) return DEFAULT_DAY_CLOSE_START_HM;
  return clampDayCloseStartHm(formatHm(parts.hour, parts.minute));
}

export function addMinutesToHm(hm: string, minutes: number): string {
  const total =
    (((hmToMinutes(hm) + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return formatHm(Math.floor(total / 60), total % 60);
}

export function dayCloseScheduleFromStart(
  startHm: string | null | undefined
): DayCloseSchedule {
  const start = parseDayCloseStartHm(startHm);
  return {
    startHm: start,
    endHm: addMinutesToHm(start, DAY_CLOSE_DURATION_MINUTES),
  };
}

export function parseDayClosePrefsJson(raw: string | null): DayCloseSchedule {
  if (!raw?.trim()) return dayCloseScheduleFromStart(DEFAULT_DAY_CLOSE_START_HM);
  try {
    const parsed = JSON.parse(raw) as { startHm?: string };
    return dayCloseScheduleFromStart(parsed.startHm);
  } catch {
    return dayCloseScheduleFromStart(raw);
  }
}
