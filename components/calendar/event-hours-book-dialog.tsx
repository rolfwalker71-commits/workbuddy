"use client";

import { useEffect, useState } from "react";
import { MaringoTimeBookDialog } from "@/components/maringo/maringo-time-book-dialog";
import type { TimeBookFormDefaults } from "@/components/maringo/maringo-time-book-form";
import type { MariEmailPartnerSuggestion } from "@/lib/mari/customers";
import { calendarEventToBookDefaults } from "@/lib/mari/event-title-tokens";
import {
  classifyEventMeetingKind,
  eventBookingRefHasCodes,
} from "@/lib/mari/event-booking-ref";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";
import type {
  HoursBookedStampLike,
  WorkspaceEventMari,
} from "@/lib/workspace/event-mari-shared";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";

export type HoursBookableEvent = {
  id: string;
  provider: WorkspaceProvider;
  calendarId?: string | null;
  title: string;
  date: string;
  time?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  calendarType?: string | null;
  attendeeEmails?: string[] | null;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
  mari?: WorkspaceEventMari | null;
};

const HOURS_HINT =
  "Vorlage aus der Termindauer: verrechenbar = Dauer, nicht verrechenbar = 0. Anpassen erhöht die Summe — der Outlook-Termin bleibt unverändert.";

export function EventHoursBookDialog({
  event,
  open,
  onOpenChange,
  onBooked,
}: {
  event: HoursBookableEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked?: (stamp?: HoursBookedStampLike | null) => void;
}) {
  const [defaults, setDefaults] = useState<TimeBookFormDefaults | null>(null);
  const [subjectSuggestions, setSubjectSuggestions] = useState<
    MariEmailPartnerSuggestion[]
  >([]);
  const [initialHint, setInitialHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !event) {
      setDefaults(null);
      setSubjectSuggestions([]);
      setInitialHint(null);
      return;
    }
    const issueId =
      event.mari?.issueId != null && event.mari.issueId > 0
        ? event.mari.issueId
        : null;
    let cancelled = false;
    setLoading(true);
    setSubjectSuggestions([]);
    setInitialHint(null);
    void (async () => {
      let ticket: {
        issueId: number;
        projectNumber?: string | null;
        projectLabel?: string | null;
        contractId?: number | null;
        contractPositionId?: number | null;
        activity?: string | null;
      } | null = null;
      if (issueId) {
        try {
          const res = await fetch(`/api/maringo/tickets/${issueId}`);
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ticket) {
            const t = data.ticket as {
              issueId: number;
              projectNumber?: string | null;
              addressMatchcode?: string | null;
              cardCode?: string | null;
              contractId?: number | null;
              contractPositionId?: number | null;
              briefDescription?: string | null;
            };
            ticket = {
              issueId: t.issueId,
              projectNumber: t.projectNumber,
              projectLabel: t.projectNumber
                ? formatMariProjectLabel(
                    t.projectNumber,
                    t.addressMatchcode || t.cardCode
                  )
                : null,
              contractId: t.contractId,
              contractPositionId: t.contractPositionId,
              activity: t.briefDescription,
            };
          }
        } catch {
          ticket = { issueId };
        }
      }
      if (cancelled) return;
      const stored = event.mari?.booking ?? null;
      const meetingKind = classifyEventMeetingKind(event.attendeeEmails);
      const preferStored =
        stored != null &&
        (stored.source === "pinned" ||
          stored.source === "graph" ||
          stored.source === "ticket" ||
          eventBookingRefHasCodes(stored));
      const next = calendarEventToBookDefaults({
        title: event.title,
        date: event.date,
        startHm: event.time,
        endHm: event.endTime,
        memo: event.mari?.memo || event.title,
        ticket,
        stored: preferStored ? stored : null,
        contractOptional:
          meetingKind === "internal" || stored?.contractOptional === true,
      });
      if (preferStored && stored) {
        next.cardCode = stored.cardCode;
        next.customerName = stored.customerName;
      }
      let titleSuggestions: MariEmailPartnerSuggestion[] = [];
      let titleHint: string | null = null;
      if (preferStored) {
        titleHint =
          stored.source === "pinned"
            ? "Gespeicherte Zuordnung aus dem Termin — nicht neu erraten."
            : stored.meetingKind === "internal"
              ? "Interner Termin — Projekt prüfen, Vertrag in der Regel nicht nötig."
              : null;
      } else {
      try {
        const titleRes = await fetch(
          `/api/maringo/customers?eventTitle=${encodeURIComponent(event.title.slice(0, 200))}`
        );
        const titleData = await titleRes.json().catch(() => ({}));
        if (titleRes.ok) {
          titleSuggestions = (titleData.suggestions ||
            []) as MariEmailPartnerSuggestion[];
          const prefill = titleData.prefill as
            | {
                projectNumber?: string | null;
                projectLabel?: string | null;
                contractId?: number | null;
                hint?: string | null;
              }
            | undefined;
          const ticketProject = (ticket?.projectNumber || "").trim();
          if (!ticketProject && prefill?.projectNumber) {
            next.projectNumber = prefill.projectNumber;
            next.projectLabel = formatMariProjectLabel(
              prefill.projectNumber,
              prefill.projectLabel || prefill.projectNumber
            );
            if (
              next.contractId == null &&
              prefill.contractId != null &&
              prefill.contractId > 0
            ) {
              next.contractId = prefill.contractId;
            }
            titleHint = prefill.hint || null;
          } else if (prefill?.hint && !ticketProject) {
            titleHint = prefill.hint;
          }
        }
      } catch {
        titleSuggestions = [];
      }
      }
      if (cancelled) return;
      setSubjectSuggestions(titleSuggestions);
      setInitialHint(titleHint);
      setDefaults(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, event]);

  const issueId =
    event?.mari?.issueId != null && event.mari.issueId > 0
      ? event.mari.issueId
      : null;

  return (
    <MaringoTimeBookDialog
      open={open && Boolean(event) && !loading}
      onOpenChange={onOpenChange}
      defaults={defaults}
      title={
        issueId
          ? `Stunden aus Termin · Ticket #${issueId}`
          : event
            ? `Stunden aus Termin · ${event.title}`
            : "Stunden buchen"
      }
      description={HOURS_HINT}
      submitLabel={issueId ? "Auf Ticket buchen" : "Stunden buchen"}
      calendarEvent={
        event && event.provider === "microsoft"
          ? {
              eventId: event.id,
              calendarId: event.calendarId ?? null,
              eventDate: event.date,
              startHm: event.time ?? null,
              endHm: event.endTime ?? null,
              title: event.title,
              issueId,
              seriesMasterId: event.seriesMasterId ?? null,
              iCalUId: event.iCalUId ?? null,
              cardCode:
                event.mari?.booking?.cardCode ?? event.mari?.cardCode ?? null,
              customerName: event.mari?.booking?.customerName ?? null,
              projectNumber: event.mari?.booking?.projectNumber ?? null,
              projectLabel: event.mari?.booking?.projectLabel ?? null,
              contractId: event.mari?.booking?.contractId ?? null,
              contractVisible: event.mari?.booking?.contractVisible ?? null,
            }
          : null
      }
      attendeeEmails={
        event && classifyEventMeetingKind(event.attendeeEmails) === "internal"
          ? []
          : event?.attendeeEmails
      }
      subjectSuggestions={subjectSuggestions}
      initialHint={initialHint}
      preserveEventPrefillOnChips
      onBooked={onBooked}
    />
  );
}
