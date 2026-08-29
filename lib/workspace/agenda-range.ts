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
import {
  toWorkspaceTodayEvent,
  type WorkspaceTodayEvent,
} from "@/lib/workspace/merge-today";

export type AgendaRangeSources = {
  microsoft: boolean;
  google: boolean;
};

export type AgendaRangeLoad = {
  sources: AgendaRangeSources;
  events: WorkspaceTodayEvent[];
  errors: string[];
};

function sortAgenda(events: WorkspaceTodayEvent[]): WorkspaceTodayEvent[] {
  return [...events].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate) return byDate;
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    if (ta !== tb) return ta.localeCompare(tb);
    return a.title.localeCompare(b.title, "de");
  });
}

/**
 * Microsoft + Google events in [from, to] (Zurich YMD, inclusive).
 * No day-close ritual and no end-of-day grace — those are today-list only.
 */
export async function loadWorkspaceAgendaInRange(
  userId: number,
  from: string,
  to: string,
  options?: {
    request?: Request | null;
    wantMicrosoft?: boolean;
    wantGoogle?: boolean;
  }
): Promise<AgendaRangeLoad> {
  const wantMs = options?.wantMicrosoft !== false;
  const wantGo = options?.wantGoogle !== false;
  const microsoft =
    wantMs && isMicrosoftConnected(userId) && hasMicrosoftCalendarScope(userId);
  const google =
    wantGo && isGoogleMailConnected(userId) && hasGoogleCalendarScope(userId);
  const errors: string[] = [];

  const [msEvents, googleEvents] = await Promise.all([
    (async (): Promise<WorkspaceTodayEvent[]> => {
      if (!microsoft) return [];
      try {
        const { events } = await listMicrosoftAgendaInRange(userId, from, to);
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
            description: e.description,
            meetUrl: e.meetUrl,
            calendarType: e.type,
            calendarName: e.calendarName,
            attendeeEmails: e.attendeeEmails,
          })
        );
      } catch (error) {
        errors.push(
          `Microsoft: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
      }
    })(),
    (async (): Promise<WorkspaceTodayEvent[]> => {
      if (!google) return [];
      try {
        const { events } = await listGoogleAgendaInRange(
          userId,
          from,
          to,
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
            description: e.description,
            meetUrl: e.meetUrl,
            calendarType: e.type,
            calendarName: e.calendarName,
          })
        );
      } catch (error) {
        errors.push(
          `Google: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
      }
    })(),
  ]);

  return {
    sources: { microsoft, google },
    events: sortAgenda([...msEvents, ...googleEvents]),
    errors,
  };
}
