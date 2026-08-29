"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EventBookingAttachDialog } from "@/components/calendar/event-booking-attach-dialog";
import { HoursSplitBagel } from "@/components/ui/hours-split-bagel";
import {
  classifyEventMeetingKind,
  eventBookingRefHasCodes,
  formatBookedHoursLine,
  formatEventBookingLine,
  type EventBookingRef,
  type EventMeetingKind,
} from "@/lib/mari/event-booking-ref";
import {
  hoursSplitFromStamp,
  type WorkspaceEventMari,
} from "@/lib/workspace/event-mari-shared";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";

const guessCache = new Map<string, Promise<EventBookingRef | null>>();

function guessKey(title: string, emails: string[], kind: EventMeetingKind) {
  return `${kind}::${title.slice(0, 200)}::${emails.join(",")}`;
}

async function fetchGuess(
  title: string,
  emails: string[]
): Promise<EventBookingRef | null> {
  const params = new URLSearchParams();
  if (title) params.set("title", title.slice(0, 200));
  if (emails.length) params.set("emails", emails.join(","));
  const res = await fetch(`/api/maringo/event-booking?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return (data.booking || null) as EventBookingRef | null;
}

export type EventBookingHintEvent = {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  endTime?: string | null;
  provider?: WorkspaceProvider | string | null;
  calendarId?: string | null;
  calendarType?: string | null;
  attendeeEmails?: string[] | null;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
  mari?: WorkspaceEventMari | null;
};

export function EventBookingHint({
  event,
  onBookingSaved,
}: {
  event: EventBookingHintEvent;
  onBookingSaved?: (booking: EventBookingRef) => void;
}) {
  const provider = event.provider;
  const hide =
    provider === "google" ||
    provider === "buddy" ||
    event.calendarType === "birthday";
  const meetingKind = classifyEventMeetingKind(event.attendeeEmails);
  const ticket =
    event.mari?.issueId != null && event.mari.issueId > 0;
  const attached = event.mari?.booking ?? null;
  const skipGuess =
    ticket ||
    (attached != null &&
      (attached.source === "pinned" ||
        attached.source === "graph" ||
        attached.source === "ticket" ||
        eventBookingRefHasCodes(attached)));

  const [guess, setGuess] = useState<EventBookingRef | null>(
    skipGuess ? attached : null
  );
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    if (hide || skipGuess) {
      setGuess(attached);
      return;
    }
    const emails = event.attendeeEmails || [];
    const key = guessKey(event.title, emails, meetingKind);
    let cached = guessCache.get(key);
    if (!cached) {
      cached = fetchGuess(event.title, emails);
      guessCache.set(key, cached);
    }
    let cancelled = false;
    void cached.then((ref) => {
      if (!cancelled) setGuess(ref);
    });
    return () => {
      cancelled = true;
    };
  }, [
    hide,
    skipGuess,
    attached,
    event.title,
    event.attendeeEmails,
    meetingKind,
  ]);

  if (hide) return null;

  const shown = attached?.source === "pinned" || attached?.source === "graph"
    ? attached
    : attached || guess;
  const line = formatEventBookingLine(shown);
  const quiet = !line;
  const booked = event.mari?.stampStatus === "booked";
  const split = hoursSplitFromStamp(
    event.mari?.hours,
    event.mari?.hoursBillable
  );

  if (booked) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <HoursSplitBagel
          billable={split.billable}
          nonBillable={split.nonBillable}
        />
        <p className="min-w-0 text-xs leading-snug text-muted-foreground">
          {formatBookedHoursLine(shown)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {quiet ? (
        <span className="text-xs leading-snug text-muted-foreground">
          Nichts erkannt
        </span>
      ) : (
        <button
          type="button"
          className="min-w-0 text-left text-xs leading-snug text-muted-foreground hover:text-foreground"
          onClick={() => setOverlayOpen(true)}
        >
          {line}
        </button>
      )}
      <Button
        type="button"
        variant="link"
        size="xs"
        className="h-auto min-h-0 px-0 py-0 text-xs font-medium"
        onClick={() => setOverlayOpen(true)}
      >
        Ändern
      </Button>
      <EventBookingAttachDialog
        open={overlayOpen}
        onOpenChange={setOverlayOpen}
        meetingKind={meetingKind}
        initial={shown}
        target={{
          eventId: event.id,
          calendarId: event.calendarId,
          eventDate: event.date,
          startHm: event.time,
          endHm: event.endTime,
          title: event.title,
          attendeeEmails: event.attendeeEmails,
          seriesMasterId: event.seriesMasterId,
          iCalUId: event.iCalUId,
        }}
        onSaved={(booking) => {
          setGuess(booking);
          onBookingSaved?.(booking);
        }}
      />
    </div>
  );
}
