import type { EventBookingRef } from "@/lib/mari/event-booking-ref";

/**
 * Hours-pins live only in WorkBuddy (`mari_calendar_stamps`).
 * Never PATCH the Graph event — category or body changes notify attendees.
 */
export async function stampMicrosoftEventBooking(
  _userId: number,
  _eventId: string,
  _ref: EventBookingRef
): Promise<{ graph: boolean; error: string | null }> {
  return { graph: false, error: null };
}
