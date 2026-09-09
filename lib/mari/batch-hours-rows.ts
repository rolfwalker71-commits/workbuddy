/**
 * Rows for the batch hours dialog: the day's still-unbooked calendar events,
 * each prefilled the same way the single Stunden-buchen dialog prefills.
 *
 * Pure — the caller passes the events the day view already holds, so opening
 * the dialog costs no extra request.
 */

import { isDayCloseRitualId } from "@/lib/dashboard/day-close-ritual";
import {
  classifyEventMeetingKind,
  type EventBookingRef,
} from "@/lib/mari/event-booking-ref";
import {
  calendarEventToBookDefaults,
  type CalendarEventBookDefaults,
} from "@/lib/mari/event-title-tokens";
import type { WorkspaceEventMari } from "@/lib/workspace/event-mari-shared";

export type BatchHoursSourceEvent = {
  id: string;
  provider: string;
  calendarId?: string | null;
  title: string;
  date: string;
  time?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  done?: boolean;
  attendeeEmails?: string[];
  seriesMasterId?: string | null;
  iCalUId?: string | null;
  mari?: WorkspaceEventMari | null;
};

export type BatchHoursRow = {
  eventId: string;
  calendarId: string | null;
  title: string;
  date: string;
  startHm: string | null;
  endHm: string | null;
  isAllDay: boolean;
  done: boolean;
  seriesMasterId: string | null;
  iCalUId: string | null;
  attendeeEmails: string[];
  /** Preselected for booking: finished, and long enough to carry hours. */
  selected: boolean;
  defaults: CalendarEventBookDefaults;
};

/** Already booked events are out — the batch must not offer a second line. */
export function isBatchHoursCandidate(event: BatchHoursSourceEvent): boolean {
  if (event.provider !== "microsoft") return false;
  if (isDayCloseRitualId(event.id)) return false;
  return event.mari?.stampStatus !== "booked";
}

export function batchHoursRowFor(event: BatchHoursSourceEvent): BatchHoursRow {
  const booking = event.mari?.booking ?? null;
  const issueId =
    event.mari?.issueId != null && event.mari.issueId > 0
      ? event.mari.issueId
      : null;
  const meetingKind = classifyEventMeetingKind(event.attendeeEmails);
  const isAllDay = Boolean(event.isAllDay);
  const defaults = calendarEventToBookDefaults({
    title: event.title,
    date: event.date,
    startHm: event.time ?? null,
    endHm: event.endTime ?? null,
    memo: event.mari?.memo || event.title,
    // attachMariToEvents already folded the ticket's project/contract into
    // `booking`; only the activity text still has to come from the ticket.
    ticket: issueId
      ? { issueId, activity: event.mari?.briefDescription ?? null }
      : null,
    stored: booking,
    contractOptional:
      meetingKind === "internal" || booking?.contractOptional === true,
  });
  return {
    eventId: event.id,
    calendarId: event.calendarId ?? null,
    title: event.title,
    date: event.date,
    startHm: event.time ?? null,
    endHm: event.endTime ?? null,
    isAllDay,
    done: Boolean(event.done),
    seriesMasterId: event.seriesMasterId ?? null,
    iCalUId: event.iCalUId ?? null,
    attendeeEmails: event.attendeeEmails ?? [],
    selected: Boolean(event.done) && !isAllDay,
    defaults,
  };
}

export function batchHoursRowsForDay(
  events: readonly BatchHoursSourceEvent[]
): BatchHoursRow[] {
  return events
    .filter(isBatchHoursCandidate)
    .map(batchHoursRowFor)
    .sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? 1 : -1;
      const byStart = (a.startHm || "").localeCompare(b.startHm || "");
      return byStart !== 0 ? byStart : a.title.localeCompare(b.title);
    });
}

/**
 * Fold in the title/attendee recognition the single event card fetches lazily.
 * A row that already carries a project keeps it — a guess never overrides a
 * pinned, graph or ticket mapping.
 */
export function applyBatchHoursGuesses(
  rows: readonly BatchHoursRow[],
  guesses: ReadonlyMap<string, EventBookingRef | null>
): BatchHoursRow[] {
  return rows.map((row) => {
    if (row.defaults.projectNumber) return row;
    const guess = guesses.get(row.eventId);
    if (!guess?.projectNumber) return row;
    return {
      ...row,
      defaults: {
        ...row.defaults,
        projectNumber: guess.projectNumber,
        projectLabel: guess.projectLabel || guess.projectNumber,
        contractId:
          row.defaults.contractId ??
          (guess.contractId != null && guess.contractId > 0
            ? guess.contractId
            : null),
        contractVisible: row.defaults.contractVisible || guess.contractVisible,
        cardCode: row.defaults.cardCode || guess.cardCode,
        customerName: row.defaults.customerName || guess.customerName,
        contractOptional:
          row.defaults.contractOptional || guess.contractOptional === true,
      },
    };
  });
}

/** Rows the batch still has to ask the server about. */
export function batchHoursRowsNeedingGuess(
  rows: readonly BatchHoursRow[]
): BatchHoursRow[] {
  return rows.filter((row) => !row.defaults.projectNumber);
}

/** Rows still missing something Maringo requires before they can be booked. */
export function batchHoursRowBlockers(row: BatchHoursRow): string[] {
  const out: string[] = [];
  if (!row.defaults.projectNumber) out.push("project");
  if (row.defaults.contractId == null && !row.defaults.contractOptional) {
    out.push("contract");
  }
  if (!row.defaults.activity.trim()) out.push("activity");
  return out;
}
