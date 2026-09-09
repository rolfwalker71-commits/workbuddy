/**
 * Server-only ritual completeness (OAuth caches, Maringo stamps).
 * Do not import from client components.
 */
import type { MsCalendarEvent } from "@/lib/microsoft/calendar-review";
import {
  countOpenPlanningEvents,
  isDayCloseRitualId,
  withDayCloseRitualGoogleEvents,
  withDayCloseRitualMsEvents,
  type DayCloseCalendarItem,
  type DayCloseGoogleReviewEvent,
  type DayCloseRitualStatus,
} from "@/lib/dashboard/day-close-ritual";
import { getDayCloseSchedule } from "@/lib/dashboard/day-close-prefs";
import { zurichHm } from "@/lib/microsoft/time";

export async function resolveDayCloseRitualStatus(
  userId: number | null | undefined,
  todayIso: string,
  todayCalendar: DayCloseCalendarItem[]
): Promise<DayCloseRitualStatus> {
  const calendarOpen = countOpenPlanningEvents(
    todayIso,
    todayCalendar,
    zurichHm()
  );

  let googleDayDone: boolean | null = null;
  let microsoftDayDone: boolean | null = null;
  let mariHoursPending: number | null = null;

  if (userId != null) {
    try {
      const { isGoogleMailConnected } = await import("@/lib/google/oauth");
      if (isGoogleMailConnected(userId)) {
        const { getGoogleMailDayCached } = await import(
          "@/lib/google/mail-day-analysis-job"
        );
        googleDayDone = Boolean(getGoogleMailDayCached(userId, todayIso));
      }
    } catch {
      /* optional */
    }
    try {
      const { isMicrosoftConnected } = await import("@/lib/microsoft/oauth");
      if (isMicrosoftConnected(userId)) {
        const { getMsMailDayCached } = await import(
          "@/lib/microsoft/mail-day-analysis-job"
        );
        microsoftDayDone = Boolean(getMsMailDayCached(userId, todayIso));
      }
    } catch {
      /* optional */
    }
    try {
      const { getAppUserById, userHasModule } = await import(
        "@/lib/users/queries"
      );
      const user = getAppUserById(userId);
      if (user && userHasModule(userId, "maringo", Boolean(user.is_admin))) {
        const { listPendingMariCalendarStamps } = await import(
          "@/lib/mari/calendar-stamp"
        );
        mariHoursPending = listPendingMariCalendarStamps(userId, {
          onOrBeforeDate: todayIso,
        }).length;
      }
    } catch {
      /* optional */
    }
  }

  return { calendarOpen, googleDayDone, microsoftDayDone, mariHoursPending };
}

/**
 * The assistant polls its status every 20s per open tab, and this load is the
 * only expensive part of it — one Graph and one Google calendar round trip.
 * A short cache collapses all those tabs into one call per window.
 *
 * Only the calendar is cached; Maringo stamps and the mail-day flags are read
 * fresh on every request, so a booking still shows up immediately. The count
 * of open events may lag by up to the TTL.
 */
const RITUAL_CALENDAR_TTL_MS = 3 * 60_000;
const ritualCalendarCache = new Map<
  string,
  { at: number; items: DayCloseCalendarItem[] }
>();

export async function loadTodayCalendarForRitual(
  userId: number,
  todayIso: string
): Promise<DayCloseCalendarItem[]> {
  const cacheKey = `${userId}:${todayIso}`;
  const cached = ritualCalendarCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RITUAL_CALENDAR_TTL_MS) {
    return cached.items;
  }
  const items = await loadTodayCalendarUncached(userId, todayIso);
  ritualCalendarCache.set(cacheKey, { at: Date.now(), items });
  // Yesterday's entries are dead weight once the day rolls over.
  for (const key of ritualCalendarCache.keys()) {
    if (!key.endsWith(`:${todayIso}`)) ritualCalendarCache.delete(key);
  }
  return items;
}

async function loadTodayCalendarUncached(
  userId: number,
  todayIso: string
): Promise<DayCloseCalendarItem[]> {
  const items: DayCloseCalendarItem[] = [];
  try {
    const { isMicrosoftConnected } = await import("@/lib/microsoft/oauth");
    if (isMicrosoftConnected(userId)) {
      const { listMicrosoftAgendaInRange } = await import(
        "@/lib/microsoft/calendars"
      );
      const { events } = await listMicrosoftAgendaInRange(
        userId,
        todayIso,
        todayIso
      );
      for (const e of events) {
        if (isDayCloseRitualId(e.id)) continue;
        items.push({
          id: e.id,
          title: e.summary,
          date: e.date,
          planningRelevant: e.planningRelevant,
          time: e.time,
          endTime: e.endTime,
          isAllDay: !e.time,
        });
      }
    }
  } catch {
    /* optional */
  }
  try {
    const { isGoogleMailConnected, hasGoogleCalendarScope } = await import(
      "@/lib/google/oauth"
    );
    if (isGoogleMailConnected(userId) && hasGoogleCalendarScope(userId)) {
      const { listGoogleCalendarEventsInRange } = await import(
        "@/lib/google/calendars"
      );
      const events = await listGoogleCalendarEventsInRange(
        userId,
        todayIso,
        todayIso
      );
      for (const e of events) {
        if (isDayCloseRitualId(e.id)) continue;
        items.push({
          id: e.id,
          title: e.summary,
          date: e.date,
          planningRelevant: e.planningRelevant,
          time: e.time,
          endTime: e.endTime,
          isAllDay: !e.time,
        });
      }
    }
  } catch {
    /* optional */
  }
  return items;
}

export async function attachDayCloseRitualMs(
  userId: number | null,
  todayIso: string,
  events: MsCalendarEvent[]
): Promise<MsCalendarEvent[]> {
  const calendar =
    userId != null
      ? await loadTodayCalendarForRitual(userId, todayIso).catch(() =>
          events.map((e) => ({
            id: e.id,
            title: e.subject,
            date: e.date,
            planningRelevant: true as const,
          }))
        )
      : events.map((e) => ({
          id: e.id,
          title: e.subject,
          date: e.date,
          planningRelevant: true as const,
        }));
  const status = await resolveDayCloseRitualStatus(userId, todayIso, calendar);
  const schedule =
    userId != null ? getDayCloseSchedule(userId) : undefined;
  return withDayCloseRitualMsEvents(
    events,
    todayIso,
    status,
    schedule
  ) as MsCalendarEvent[];
}

export async function attachDayCloseRitualGoogle<
  T extends DayCloseGoogleReviewEvent,
>(
  userId: number | null,
  todayIso: string,
  events: T[]
): Promise<T[]> {
  const calendar =
    userId != null
      ? await loadTodayCalendarForRitual(userId, todayIso).catch(() =>
          events.map((e) => ({
            id: e.id,
            title: e.subject,
            date: e.date,
            planningRelevant: true as const,
          }))
        )
      : events.map((e) => ({
          id: e.id,
          title: e.subject,
          date: e.date,
          planningRelevant: true as const,
        }));
  const status = await resolveDayCloseRitualStatus(userId, todayIso, calendar);
  const schedule =
    userId != null ? getDayCloseSchedule(userId) : undefined;
  return withDayCloseRitualGoogleEvents(events, todayIso, status, schedule);
}
