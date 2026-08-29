/**
 * Recognize and persist Kunde/Projekt/Vertrag on a calendar event.
 * MARI reads only — no SQL writes.
 */
import {
  lookupMariPartnersByEmails,
  suggestMariPartnersFromEventTitle,
} from "@/lib/mari/customers";
import {
  applyMeetingKind,
  bookingRefFromRecognition,
  classifyEventMeetingKind,
  eventBookingRefHasCodes,
  pickPreferredBookingRef,
  type EventBookingRef,
  type EventMeetingKind,
} from "@/lib/mari/event-booking-ref";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";
import type { MariTicketListItem } from "@/lib/mari/tickets";
import type { MariCalendarStamp } from "@/lib/mari/calendar-stamp";

export function bookingRefFromTicket(
  ticket: Pick<
    MariTicketListItem,
    | "cardCode"
    | "addressMatchcode"
    | "projectNumber"
    | "contractId"
    | "contractNumber"
  > | null
    | undefined,
  meetingKind: EventMeetingKind
): EventBookingRef | null {
  if (!ticket) return null;
  return applyMeetingKind(
    {
      cardCode: ticket.cardCode || null,
      customerName: (ticket.addressMatchcode || "").trim() || null,
      projectNumber: ticket.projectNumber || null,
      projectLabel: ticket.projectNumber
        ? formatMariProjectLabel(
            ticket.projectNumber,
            ticket.addressMatchcode || ticket.cardCode
          )
        : null,
      contractId:
        ticket.contractId != null && ticket.contractId > 0
          ? ticket.contractId
          : null,
      contractVisible: ticket.contractNumber || null,
      source: "ticket",
      meetingKind,
      contractOptional: false,
    },
    meetingKind
  );
}

export function bookingRefFromStamp(
  stamp: MariCalendarStamp | null | undefined,
  meetingKind: EventMeetingKind
): EventBookingRef | null {
  if (!stamp) return null;
  const coded = eventBookingRefHasCodes({
    cardCode: stamp.cardCode,
    customerName: stamp.customerName,
    projectNumber: stamp.projectNumber,
    projectLabel: stamp.projectLabel,
    contractId: stamp.contractId,
    contractVisible: stamp.contractVisible,
    source: stamp.bookingPinned ? "pinned" : "graph",
    meetingKind,
    contractOptional: false,
  });
  if (!stamp.bookingPinned && !coded) {
    return null;
  }
  return applyMeetingKind(
    {
      cardCode: stamp.cardCode,
      customerName: stamp.customerName,
      projectNumber: stamp.projectNumber,
      projectLabel: stamp.projectLabel,
      contractId: stamp.contractId,
      contractVisible: stamp.contractVisible,
      source: stamp.bookingPinned ? "pinned" : "graph",
      meetingKind,
      contractOptional: false,
    },
    meetingKind
  );
}

export async function recognizeEventBooking(input: {
  title: string;
  attendeeEmails?: string[] | null;
}): Promise<{
  booking: EventBookingRef | null;
  meetingKind: EventMeetingKind;
}> {
  const meetingKind = classifyEventMeetingKind(input.attendeeEmails);
  const titleResult = await suggestMariPartnersFromEventTitle(
    (input.title || "").slice(0, 200)
  );
  const attendees =
    meetingKind === "mixed"
      ? await lookupMariPartnersByEmails(input.attendeeEmails || [])
      : [];
  const booking = bookingRefFromRecognition({
    meetingKind,
    title: {
      cardCode: titleResult.cardCode,
      projectNumber: titleResult.projectNumber,
      contractVisible: titleResult.contractVisible,
      suggestions: titleResult.suggestions.map((s) => ({
        cardCode: s.cardCode,
        name: s.name,
        projectNumber: s.projectNumber,
        projectLabel: s.projectLabel,
        contractId: s.contractId,
      })),
      prefill: {
        projectNumber: titleResult.prefill.projectNumber,
        projectLabel: titleResult.prefill.projectLabel,
        contractId: titleResult.prefill.contractId,
      },
    },
    attendees: attendees.map((s) => ({
      cardCode: s.cardCode,
      name: s.name,
      projectNumber: s.projectNumber,
      projectLabel: s.projectLabel,
      contractId: s.contractId,
    })),
  });
  return { booking, meetingKind };
}

export function resolveAttachedBooking(input: {
  meetingKind: EventMeetingKind;
  ticket: EventBookingRef | null;
  stamp: EventBookingRef | null;
  graph: EventBookingRef | null;
}): EventBookingRef | null {
  const ticket = applyMeetingKind(input.ticket, input.meetingKind);
  const stamp = applyMeetingKind(input.stamp, input.meetingKind);
  const graph = applyMeetingKind(input.graph, input.meetingKind);
  return pickPreferredBookingRef(stamp, ticket, graph);
}
