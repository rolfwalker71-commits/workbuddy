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
  memo?: string | null;
  cardCode: string | null;
  briefDescription: string | null;
  status: number | null;
  statusName: string | null;
  /** Ticket/pin/graph combo for Stunden buchen — guess is filled on the card. */
  booking?: EventBookingRef | null;
};

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
