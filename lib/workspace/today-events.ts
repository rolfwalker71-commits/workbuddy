import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import {
  isDayCloseRitualId,
  withDayCloseRitual,
} from "@/lib/dashboard/day-close-ritual";
import { resolveDayCloseRitualStatus } from "@/lib/dashboard/day-close-status";
import { loadWorkspaceAgendaInRange } from "@/lib/workspace/agenda-range";
import { filterTodayEventsAfterGrace } from "@/lib/workspace/event-grace";
import {
  ritualAsWorkspaceTodayEvent,
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
  const loaded = await loadWorkspaceAgendaInRange(userId, today, today, options);
  const merged = loaded.events;
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
