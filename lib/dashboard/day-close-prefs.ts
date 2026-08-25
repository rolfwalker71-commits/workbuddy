import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  dayCloseScheduleFromStart,
  dayCloseSettingKey,
  parseDayClosePrefsJson,
  type DayCloseSchedule,
} from "@/lib/dashboard/day-close-prefs-parse";

export type { DayCloseSchedule };
export {
  DEFAULT_DAY_CLOSE_START_HM,
  DAY_CLOSE_DURATION_MINUTES,
  dayCloseScheduleFromStart,
  dayCloseSettingKey,
  parseDayCloseStartHm,
} from "@/lib/dashboard/day-close-prefs-parse";

export function getDayCloseSchedule(userId: number): DayCloseSchedule {
  return parseDayClosePrefsJson(getSetting(dayCloseSettingKey(userId)));
}

export function saveDayCloseStartHm(
  userId: number,
  startHm: string
): DayCloseSchedule {
  const schedule = dayCloseScheduleFromStart(startHm);
  setSetting(
    dayCloseSettingKey(userId),
    JSON.stringify({ startHm: schedule.startHm })
  );
  return schedule;
}
