"use client";

import { EventBookingHint } from "@/components/calendar/event-booking-hint";
import { EventMariActions } from "@/components/calendar/event-mari-actions";
import { useAuth } from "@/components/auth/auth-provider";
import type { EventBookingRef } from "@/lib/mari/event-booking-ref";
import type { WorkspaceEventMari } from "@/lib/workspace/event-mari-shared";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";

export type EventMariBlockEvent = {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  provider?: WorkspaceProvider | string | null;
  calendarId?: string | null;
  calendarType?: string | null;
  attendeeEmails?: string[] | null;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
  mari?: WorkspaceEventMari | null;
};

export function EventMariBlock({
  event,
  onBookHours,
  onBookingSaved,
}: {
  event: EventMariBlockEvent;
  onBookHours?: () => void;
  onBookingSaved?: (booking: EventBookingRef) => void;
}) {
  const { me } = useAuth();
  const maringoOn = me?.modules?.includes("maringo") ?? false;
  const showHint =
    maringoOn &&
    event.provider !== "google" &&
    event.provider !== "buddy" &&
    event.calendarType !== "birthday";

  return (
    <div className="space-y-2">
      {showHint ? (
        <EventBookingHint event={event} onBookingSaved={onBookingSaved} />
      ) : null}
      <EventMariActions
        mari={event.mari}
        eventDate={event.date}
        endTime={event.endTime}
        time={event.time}
        isAllDay={event.isAllDay}
        provider={event.provider}
        calendarType={event.calendarType}
        onBookHours={onBookHours}
      />
    </div>
  );
}
