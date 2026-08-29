/**
 * Virtual weekday ritual «Tagesabschluss» (default 18:30–18:45 Europe/Zurich).
 * Start time is per-user (Konto). Buddy-only — never written to Google or Outlook.
 * This module is client-safe (no db / OAuth imports).
 */

import { isAgendaItemPastGrace } from "@/lib/workspace/event-grace";
import {
  DEFAULT_DAY_CLOSE_START_HM,
  dayCloseScheduleFromStart,
  type DayCloseSchedule,
} from "@/lib/dashboard/day-close-prefs-parse";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

export const DAY_CLOSE_RITUAL_ID = "buddy-day-close";
export const DAY_CLOSE_TIME = DEFAULT_DAY_CLOSE_START_HM;
export const DAY_CLOSE_END_TIME = "18:45";
export const DAY_CLOSE_CALENDAR_ID = "buddy-ritual";
export type { DayCloseSchedule };

export function isDayCloseRitualId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(DAY_CLOSE_RITUAL_ID));
}

/** Mo–Fr in Europe/Zurich for a YYYY-MM-DD. */
export function isZurichWeekday(ymd: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich",
    weekday: "short",
  }).formatToParts(new Date(`${ymd}T12:00:00Z`));
  const wd = parts.find((p) => p.type === "weekday")?.value || "";
  return wd !== "Sat" && wd !== "Sun";
}

export type DayCloseRitualStatus = {
  calendarOpen: number;
  googleDayDone: boolean | null;
  microsoftDayDone: boolean | null;
  /** null = Maringo module off / unknown */
  mariHoursPending: number | null;
};

export type DayCloseCalendarItem = {
  id: string;
  title: string;
  date: string;
  planningRelevant?: boolean | null;
  time?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
};

export type DayCloseRitualItem = {
  id: string;
  kind: "deadline";
  date: string;
  title: string;
  subtitle: string;
  time: string;
  endTime: string;
  href: string;
  badge: string;
  accentColor: string;
  calendarId: string;
  calendarName: string;
  planningRelevant: true;
  description: string;
};

function ritualSubtitle(
  status?: DayCloseRitualStatus | null,
  locale: Locale | string = DEFAULT_LOCALE
): string {
  const bits: string[] = [
    status?.mariHoursPending != null
      ? translate(locale, "closeout.subtitleWithHours")
      : translate(locale, "closeout.subtitleBase"),
  ];
  if (status) {
    if (status.calendarOpen > 0) {
      bits.push(
        translate(locale, "closeout.eventsOpen", {
          count: status.calendarOpen,
        })
      );
    }
    const analyses: string[] = [];
    if (status.googleDayDone === false) {
      analyses.push(translate(locale, "closeout.gmailMissing"));
    }
    if (status.microsoftDayDone === false) {
      analyses.push(translate(locale, "closeout.outlookMissing"));
    }
    if (status.googleDayDone === true) {
      analyses.push(translate(locale, "closeout.gmailOk"));
    }
    if (status.microsoftDayDone === true) {
      analyses.push(translate(locale, "closeout.outlookOk"));
    }
    if (analyses.length) bits.push(analyses.join(" · "));
    if (status.mariHoursPending != null && status.mariHoursPending > 0) {
      bits.push(
        translate(
          locale,
          status.mariHoursPending === 1
            ? "closeout.hourSuggestion"
            : "closeout.hourSuggestions",
          { count: status.mariHoursPending }
        )
      );
    }
  }
  return bits.join(" · ");
}

export function isDayCloseRitualComplete(
  status?: DayCloseRitualStatus | null
): boolean {
  if (!status) return false;
  if (status.calendarOpen > 0) return false;
  if (status.googleDayDone === false) return false;
  if (status.microsoftDayDone === false) return false;
  if (status.mariHoursPending != null && status.mariHoursPending > 0) {
    return false;
  }
  return true;
}

export function buildDayCloseRitualItem(
  todayIso: string,
  status?: DayCloseRitualStatus | null,
  schedule?: DayCloseSchedule | null,
  locale: Locale | string = DEFAULT_LOCALE
): DayCloseRitualItem {
  const done = isDayCloseRitualComplete(status);
  const clock = dayCloseScheduleFromStart(schedule?.startHm);
  return {
    id: DAY_CLOSE_RITUAL_ID,
    kind: "deadline",
    date: todayIso,
    title: done
      ? translate(locale, "closeout.titleDone")
      : translate(locale, "closeout.title"),
    subtitle: ritualSubtitle(status, locale),
    time: clock.startHm,
    endTime: clock.endHm,
    href: "/",
    badge: translate(locale, "closeout.ritual"),
    accentColor: "#0f766e",
    calendarId: DAY_CLOSE_CALENDAR_ID,
    calendarName: "Buddy",
    planningRelevant: true,
    description: translate(locale, "closeout.description"),
  };
}

function timeKey(item: { time?: string | null; startHm?: string | null }): string {
  return item.time || item.startHm || "99:99";
}

/** Appends the ritual on weekdays; strips it on weekends. */
export function withDayCloseRitual<
  T extends { id: string; date?: string; time?: string | null; startHm?: string | null },
>(
  items: T[],
  todayIso: string,
  status?: DayCloseRitualStatus | null,
  mapRitual?: (ritual: DayCloseRitualItem) => T,
  schedule?: DayCloseSchedule | null,
  locale: Locale | string = DEFAULT_LOCALE
): T[] {
  const without = items.filter((i) => !isDayCloseRitualId(i.id));
  if (!isZurichWeekday(todayIso)) return without;
  const ritual = buildDayCloseRitualItem(todayIso, status, schedule, locale);
  const mapped = mapRitual
    ? mapRitual(ritual)
    : ({
        ...ritual,
        id: ritual.id,
      } as unknown as T);
  return [...without, mapped].sort((a, b) => {
    const da = a.date || todayIso;
    const db = b.date || todayIso;
    const dc = da.localeCompare(db);
    if (dc !== 0) return dc;
    return timeKey(a).localeCompare(timeKey(b));
  });
}

export function ritualAsMsCalendarEvent(ritual: DayCloseRitualItem): {
  id: string;
  subject: string;
  start: string;
  end: string;
  startHm: string;
  endHm: string;
  date: string;
  location: string;
  isAllDay: false;
  categories: string[];
  done: boolean;
  showAs: string;
  webLink: null;
  organizer: string;
} {
  return {
    id: ritual.id,
    subject: ritual.title,
    start: `${ritual.date}T${ritual.time}:00`,
    end: `${ritual.date}T${ritual.endTime}:00`,
    startHm: ritual.time,
    endHm: ritual.endTime,
    date: ritual.date,
    location: ritual.calendarName,
    isAllDay: false,
    categories: ["Ritual"],
    done: ritual.title.startsWith("✅"),
    showAs: "busy",
    webLink: null,
    organizer: "WorkBuddy",
  };
}

export function withDayCloseRitualMsEvents<
  T extends { id: string; date?: string; startHm?: string | null },
>(
  events: T[],
  todayIso: string,
  status?: DayCloseRitualStatus | null,
  schedule?: DayCloseSchedule | null,
  locale: Locale | string = DEFAULT_LOCALE
): T[] {
  return withDayCloseRitual(
    events,
    todayIso,
    status,
    ritualAsMsCalendarEvent as unknown as (ritual: DayCloseRitualItem) => T,
    schedule,
    locale
  );
}

export type DayCloseGoogleReviewEvent = {
  id: string;
  calendarId: string;
  subject: string;
  date: string;
  startHm: string | null;
  endHm: string | null;
  location: string | null;
  isAllDay: boolean;
  done: boolean;
  htmlLink: string | null;
  description?: string | null;
  meetUrl?: string | null;
  calendarType?: string | null;
  calendarName?: string | null;
};

export function ritualAsGoogleReviewEvent(
  ritual: DayCloseRitualItem
): DayCloseGoogleReviewEvent {
  return {
    id: ritual.id,
    calendarId: DAY_CLOSE_CALENDAR_ID,
    subject: ritual.title,
    date: ritual.date,
    startHm: ritual.time,
    endHm: ritual.endTime,
    location: ritual.calendarName,
    isAllDay: false,
    done: ritual.title.startsWith("✅"),
    htmlLink: null,
    description: ritual.description,
    meetUrl: null,
    calendarType: "other",
    calendarName: ritual.calendarName,
  };
}

export function withDayCloseRitualGoogleEvents<
  T extends DayCloseGoogleReviewEvent,
>(
  events: T[],
  todayIso: string,
  status?: DayCloseRitualStatus | null,
  schedule?: DayCloseSchedule | null,
  locale: Locale | string = DEFAULT_LOCALE
): T[] {
  return withDayCloseRitual(
    events,
    todayIso,
    status,
    (ritual) => ritualAsGoogleReviewEvent(ritual),
    schedule,
    locale
  ) as T[];
}

export function countOpenPlanningEvents(
  todayIso: string,
  todayCalendar: DayCloseCalendarItem[],
  nowHm?: string
): number {
  return todayCalendar.filter((i) => {
    if (i.date !== todayIso) return false;
    if (i.planningRelevant === false) return false;
    if (isDayCloseRitualId(i.id)) return false;
    if ((i.title || "").trim().startsWith("✅")) return false;
    if (nowHm && isAgendaItemPastGrace(i, todayIso, nowHm)) return false;
    return true;
  }).length;
}

