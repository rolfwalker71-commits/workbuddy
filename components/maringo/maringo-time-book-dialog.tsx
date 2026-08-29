"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MaringoTimeBookForm,
  type TimeBookFormDefaults,
  type TimeBookFormValues,
} from "@/components/maringo/maringo-time-book-form";

export type CalendarBookStampInput = {
  eventId: string;
  calendarId?: string | null;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  issueId?: number | null;
};

export function MaringoTimeBookDialog({
  open,
  onOpenChange,
  defaults,
  title = "Zeit buchen",
  description,
  submitLabel = "Auf Ticket buchen",
  editLineId,
  onBooked,
  calendarEvent,
  attendeeEmails,
  preserveEventPrefillOnChips,
  hoursHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: TimeBookFormDefaults | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  /** Wenn gesetzt: PUT statt POST (löschen + neu in MARI). */
  editLineId?: number | null;
  onBooked?: () => void;
  /** Nach erfolgreicher Buchung Stempel `booked` schreiben. */
  calendarEvent?: CalendarBookStampInput | null;
  attendeeEmails?: string[] | null;
  preserveEventPrefillOnChips?: boolean;
  hoursHint?: string | null;
}) {
  async function submit(values: TimeBookFormValues) {
    const url = editLineId
      ? `/api/maringo/timekeeping/lines/${editLineId}`
      : "/api/maringo/timekeeping/lines";
    const res = await fetch(url, {
      method: editLineId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.error ||
          (editLineId ? "Änderung fehlgeschlagen" : "Buchung fehlgeschlagen")
      );
    }
    if (calendarEvent && !editLineId) {
      const lineId = Number(data.line?.lineId);
      await fetch("/api/maringo/timekeeping/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventProvider: "microsoft",
          eventId: calendarEvent.eventId,
          calendarId: calendarEvent.calendarId ?? null,
          eventDate: calendarEvent.eventDate,
          startHm: calendarEvent.startHm ?? null,
          endHm: calendarEvent.endHm ?? null,
          title: calendarEvent.title,
          memo: values.memoText || null,
          hours: values.hours,
          issueId: calendarEvent.issueId ?? values.issueId ?? null,
          bookedLineId: Number.isInteger(lineId) && lineId > 0 ? lineId : null,
        }),
      }).catch(() => undefined);
    }
    onOpenChange(false);
    onBooked?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <MaringoTimeBookForm
          key={`${editLineId || "new"}-${defaults?.issueId || "x"}-${defaults?.projectNumber || ""}-${calendarEvent?.eventId || ""}-${open}`}
          defaults={defaults}
          submitLabel={submitLabel}
          onSubmit={submit}
          attendeeEmails={attendeeEmails}
          preserveEventPrefillOnChips={preserveEventPrefillOnChips}
          hoursHint={hoursHint}
        />
      </DialogContent>
    </Dialog>
  );
}
