/**
 * Client-safe Maringo link on a calendar event.
 * No db / Graph imports.
 */

import type { EventBookingRef } from "@/lib/mari/event-booking-ref";

export type { EventBookingRef };

export type WorkspaceEventMari = {
  issueId: number;
  stampStatus: "pending" | "booked" | "dismissed" | null;
  hours: number | null;
  hoursBillable?: number | null;
  memo?: string | null;
  cardCode: string | null;
  briefDescription: string | null;
  status: number | null;
  statusName: string | null;
  /** Ticket/pin/graph combo for Stunden buchen — guess is filled on the card. */
  booking?: EventBookingRef | null;
};

function roundStampHours(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bagel: billable vs remainder. Missing billable ⇒ all hours billable. */
export function hoursSplitFromStamp(
  hours: number | null | undefined,
  hoursBillable: number | null | undefined
): { hours: number; billable: number; nonBillable: number } {
  const rawBillable =
    hoursBillable != null && Number.isFinite(hoursBillable)
      ? Math.max(0, hoursBillable)
      : null;
  const rawTotal =
    hours != null && Number.isFinite(hours)
      ? Math.max(0, hours)
      : (rawBillable ?? 0);
  const total = roundStampHours(rawTotal);
  const billable = roundStampHours(
    rawBillable == null ? total : Math.min(total, rawBillable)
  );
  return {
    hours: total,
    billable,
    nonBillable: roundStampHours(Math.max(0, total - billable)),
  };
}

export type HomePendingStamp = {
  eventId: string;
  issueId: number;
  title: string;
  eventDate: string;
  startHm: string | null;
  endHm: string | null;
  hours: number | null;
  cardCode: string | null;
  briefDescription: string | null;
};

export function minutesUntilHm(
  startHm: string | null | undefined,
  nowHm: string
): number | null {
  const parse = (hm: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = startHm ? parse(startHm) : null;
  const now = parse(nowHm);
  if (start == null || now == null) return null;
  return start - now;
}

export function eventHasEnded(input: {
  date: string;
  endTime?: string | null;
  time?: string | null;
  isAllDay?: boolean;
  nowYmd: string;
  nowHm: string;
}): boolean {
  if (input.date < input.nowYmd) return true;
  if (input.date > input.nowYmd) return false;
  if (input.isAllDay) return false;
  const end = input.endTime || input.time;
  if (!end) return false;
  return end <= input.nowHm;
}
