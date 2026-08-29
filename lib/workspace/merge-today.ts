/**
 * Shared Kalender/Mail merge for the unified workspace (Microsoft + Google).
 * Ritual-ready event shape is the contract for Home and the day client.
 */

import {
  isDayCloseRitualId,
  withDayCloseRitual,
  type DayCloseRitualItem,
} from "@/lib/dashboard/day-close-ritual";
import type { WorkspaceEventMari } from "@/lib/workspace/event-mari-shared";

export type WorkspaceProvider = "microsoft" | "google" | "buddy";

function zurichTodayYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Today-list item used by Home, the shared day client, and later Tagesabschluss. */
export type WorkspaceTodayEvent = {
  id: string;
  title: string;
  time: string | null;
  planningRelevant: boolean;
  provider: WorkspaceProvider;
  calendarId: string | null;
  date: string;
  endTime: string | null;
  location: string | null;
  isAllDay: boolean;
  done?: boolean;
  webLink?: string | null;
  description?: string | null;
  meetUrl?: string | null;
  calendarType?: string | null;
  calendarName?: string | null;
  attendeeEmails?: string[];
  categories?: string[] | null;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
  mari?: WorkspaceEventMari | null;
};

export type WorkspaceMailSample = {
  id: string;
  subject: string;
  from: string;
  receivedOrSentAt: string | null;
  provider: WorkspaceProvider;
};

export function workspaceEventKey(event: {
  provider: WorkspaceProvider;
  calendarId?: string | null;
  id: string;
}): string {
  return `${event.provider}:${event.calendarId || ""}:${event.id}`;
}

function timeSortKey(time: string | null | undefined, isAllDay: boolean): string {
  if (isAllDay || !time) return "99:99";
  return time;
}

export function ritualAsWorkspaceTodayEvent(
  ritual: DayCloseRitualItem
): WorkspaceTodayEvent {
  return {
    id: ritual.id,
    title: ritual.title,
    time: ritual.time,
    planningRelevant: true,
    provider: "buddy",
    calendarId: ritual.calendarId,
    date: ritual.date,
    endTime: ritual.endTime,
    location: ritual.calendarName,
    isAllDay: false,
    done: ritual.title.startsWith("✅"),
    webLink: null,
    description: ritual.description || null,
    meetUrl: null,
    calendarType: "other",
    calendarName: ritual.calendarName,
  };
}

/**
 * Merge + sort today events (time, then title) and inject the virtual
 * Tagesabschluss item (`buddy-day-close`, 18:30 Mo–Fr). Never written to
 * Outlook/Google.
 */
export function mergeWorkspaceTodayEvents(
  ...groups: WorkspaceTodayEvent[][]
): WorkspaceTodayEvent[] {
  const merged = groups.flat();
  const todayIso =
    merged.find((e) => e.date)?.date || zurichTodayYmd();
  const existingRitual =
    merged.find((e) => isDayCloseRitualId(e.id) && e.done) ||
    merged.find((e) => isDayCloseRitualId(e.id));
  return withDayCloseRitual(
    merged,
    todayIso,
    undefined,
    existingRitual
      ? () => existingRitual
      : ritualAsWorkspaceTodayEvent
  );
}

export function mergeWorkspaceMailSamples(
  ...groups: WorkspaceMailSample[][]
): WorkspaceMailSample[] {
  return groups.flat().sort((a, b) => {
    const ta = a.receivedOrSentAt || "";
    const tb = b.receivedOrSentAt || "";
    if (ta !== tb) return tb.localeCompare(ta);
    return (a.subject || "").localeCompare(b.subject || "", "de");
  });
}

export function toWorkspaceTodayEvent(input: {
  id: string;
  title?: string | null;
  subject?: string | null;
  summary?: string | null;
  time?: string | null;
  startHm?: string | null;
  planningRelevant?: boolean;
  provider: WorkspaceProvider;
  calendarId?: string | null;
  date: string;
  endTime?: string | null;
  endHm?: string | null;
  location?: string | null;
  isAllDay?: boolean;
  done?: boolean;
  webLink?: string | null;
  description?: string | null;
  meetUrl?: string | null;
  calendarType?: string | null;
  calendarName?: string | null;
  attendeeEmails?: string[] | null;
  categories?: string[] | null;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
  mari?: WorkspaceEventMari | null;
}): WorkspaceTodayEvent {
  const title =
    (input.title || input.subject || input.summary || "").trim() ||
    "(ohne Titel)";
  const time = input.time ?? input.startHm ?? null;
  const isAllDay =
    input.isAllDay === true || !time;
  return {
    id: input.id,
    title,
    time,
    planningRelevant: input.planningRelevant !== false,
    provider: input.provider,
    calendarId: input.calendarId ?? null,
    date: input.date,
    endTime: input.endTime ?? input.endHm ?? null,
    location: input.location ?? null,
    isAllDay,
    done:
      input.done === true ||
      title.startsWith("✅") ||
      title.startsWith("✅ "),
    webLink: input.webLink ?? null,
    description: input.description ?? null,
    meetUrl: input.meetUrl ?? null,
    calendarType: input.calendarType ?? null,
    calendarName: input.calendarName ?? null,
    attendeeEmails: Array.isArray(input.attendeeEmails)
      ? input.attendeeEmails.filter((e) => typeof e === "string" && e.includes("@"))
      : [],
    categories: Array.isArray(input.categories) ? input.categories : undefined,
    seriesMasterId: input.seriesMasterId ?? null,
    iCalUId: input.iCalUId ?? null,
    mari: input.mari ?? null,
  };
}
