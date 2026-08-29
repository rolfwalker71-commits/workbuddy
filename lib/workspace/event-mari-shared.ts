/**
 * Client-safe Maringo link on a calendar event.
 * No db / Graph imports.
 */

import {
  applyMeetingKind,
  type EventBookingRef,
  type EventMeetingKind,
} from "@/lib/mari/event-booking-ref";

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

/** Client patch after a successful Stunden-buchen stamp write. */
export type HoursBookedStampLike = {
  hours?: number | null;
  hoursBillable?: number | null;
  memo?: string | null;
  issueId?: number | null;
  cardCode?: string | null;
  customerName?: string | null;
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractVisible?: string | null;
};

export function mariAfterHoursBooked(
  current: WorkspaceEventMari | null | undefined,
  stamp: HoursBookedStampLike,
  meetingKind: EventMeetingKind
): WorkspaceEventMari {
  const booking = applyMeetingKind(
    {
      cardCode: stamp.cardCode || current?.booking?.cardCode || null,
      customerName: stamp.customerName || current?.booking?.customerName || null,
      projectNumber:
        stamp.projectNumber || current?.booking?.projectNumber || null,
      projectLabel: stamp.projectLabel || current?.booking?.projectLabel || null,
      contractId:
        stamp.contractId != null
          ? stamp.contractId
          : current?.booking?.contractId ?? null,
      contractVisible:
        stamp.contractVisible || current?.booking?.contractVisible || null,
      source: "pinned",
      meetingKind,
      contractOptional: meetingKind === "internal",
    },
    meetingKind
  );
  const issueId =
    stamp.issueId != null && stamp.issueId > 0
      ? stamp.issueId
      : current?.issueId ?? 0;
  return {
    issueId,
    stampStatus: "booked",
    hours: stamp.hours ?? current?.hours ?? null,
    hoursBillable: stamp.hoursBillable ?? current?.hoursBillable ?? null,
    memo: stamp.memo ?? current?.memo ?? null,
    cardCode: booking?.cardCode ?? current?.cardCode ?? null,
    briefDescription: current?.briefDescription ?? null,
    status: current?.status ?? null,
    statusName: current?.statusName ?? null,
    booking,
  };
}

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
