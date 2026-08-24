import { listGoogleAgendaInRange } from "@/lib/google/calendars";
import {
  hasGoogleCalendarScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import { listMicrosoftAgendaInRange } from "@/lib/microsoft/calendars";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import {
  isDayCloseRitualId,
  withDayCloseRitual,
} from "@/lib/dashboard/day-close-ritual";
import { resolveDayCloseRitualStatus } from "@/lib/dashboard/day-close-status";
import { filterTodayEventsAfterGrace } from "@/lib/workspace/event-grace";
import {
  mergeWorkspaceTodayEvents,
  ritualAsWorkspaceTodayEvent,
  toWorkspaceTodayEvent,
  type WorkspaceTodayEvent,
} from "@/lib/workspace/merge-today";

/**
 * Today's events from connected Microsoft and/or Google calendars.
 * Shape stays ritual-ready (`id`, `title`, `time`, `planningRelevant`).
 */
export async function loadWorkspaceTodayEvents(
  userId: number,
  options?: {
    request?: Request | null;
    wantMicrosoft?: boolean;
    wantGoogle?: boolean;
  }
): Promise<WorkspaceTodayEvent[]> {
  const today = zurichYmd();
  const wantMs = options?.wantMicrosoft !== false;
  const wantGo = options?.wantGoogle !== false;

  const [ms, google] = await Promise.all([
    (async (): Promise<WorkspaceTodayEvent[]> => {
      if (
        !wantMs ||
        !isMicrosoftConnected(userId) ||
        !hasMicrosoftCalendarScope(userId)
      ) {
        return [];
      }
      try {
        const { events } = await listMicrosoftAgendaInRange(
          userId,
          today,
          today
        );
        return events.map((e) =>
          toWorkspaceTodayEvent({
            id: e.id,
            summary: e.summary,
            time: e.time,
            endTime: e.endTime,
            planningRelevant: e.planningRelevant,
            provider: "microsoft",
            calendarId: e.calendarId,
            date: e.date,
            location: e.location,
            webLink: e.webLink,
          })
        );
      } catch {
        return [];
      }
    })(),
    (async (): Promise<WorkspaceTodayEvent[]> => {
      if (
        !wantGo ||
        !isGoogleMailConnected(userId) ||
        !hasGoogleCalendarScope(userId)
      ) {
        return [];
      }
      try {
        const { events } = await listGoogleAgendaInRange(
          userId,
          today,
          today,
          options?.request
        );
        return events.map((e) =>
          toWorkspaceTodayEvent({
            id: e.id,
            summary: e.summary,
            time: e.time,
            endTime: e.endTime,
            planningRelevant: e.planningRelevant,
            provider: "google",
            calendarId: e.calendarId,
            date: e.date,
            location: e.location,
          })
        );
      } catch {
        return [];
      }
    })(),
  ]);

  const merged = mergeWorkspaceTodayEvents(ms, google);
  const status = await resolveDayCloseRitualStatus(
    userId,
    today,
    merged.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      planningRelevant: e.planningRelevant,
      time: e.time,
      endTime: e.endTime,
      isAllDay: e.isAllDay,
    }))
  );
  const withRitual = withDayCloseRitual(
    merged.filter((e) => !isDayCloseRitualId(e.id)),
    today,
    status,
    ritualAsWorkspaceTodayEvent
  );
  return filterTodayEventsAfterGrace(withRitual, today, zurichHm());
}
