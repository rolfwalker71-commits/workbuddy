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
import type { MariEmailPartnerSuggestion } from "@/lib/mari/customers";
import type { HoursBookedStampLike } from "@/lib/workspace/event-mari-shared";
import { useT } from "@/components/i18n/locale-provider";

export type CalendarBookStampInput = {
  eventId: string;
  calendarId?: string | null;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  issueId?: number | null;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
  cardCode?: string | null;
  customerName?: string | null;
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractVisible?: string | null;
};

export function MaringoTimeBookDialog({
  open,
  onOpenChange,
  defaults,
  title,
  description,
  submitLabel,
  editLineId,
  onBooked,
  calendarEvent,
  attendeeEmails,
  subjectSuggestions,
  initialHint,
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
  onBooked?: (stamp?: HoursBookedStampLike | null) => void;
  /** Nach erfolgreicher Buchung Stempel `booked` schreiben. */
  calendarEvent?: CalendarBookStampInput | null;
  attendeeEmails?: string[] | null;
  subjectSuggestions?: MariEmailPartnerSuggestion[] | null;
  initialHint?: string | null;
  preserveEventPrefillOnChips?: boolean;
  hoursHint?: string | null;
}) {
  const t = useT();
  const resolvedTitle = title ?? t("tickets.bookTime");
  const resolvedSubmit = submitLabel ?? t("timekeeping.bookOnTicket");

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
          (editLineId ? t("timekeeping.patchFailed") : t("timekeeping.bookFailed"))
      );
    }
    if (calendarEvent && !editLineId) {
      const lineId = Number(data.line?.lineId);
      const stampRes = await fetch("/api/maringo/timekeeping/suggestions", {
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
          hoursBillable: values.hoursBillable,
          issueId: calendarEvent.issueId ?? values.issueId ?? null,
          bookedLineId: Number.isInteger(lineId) && lineId > 0 ? lineId : null,
          seriesMasterId: calendarEvent.seriesMasterId ?? null,
          iCalUId: calendarEvent.iCalUId ?? null,
          cardCode: values.cardCode || calendarEvent.cardCode || null,
          customerName: values.customerName || calendarEvent.customerName || null,
          projectNumber: values.projectNumber || calendarEvent.projectNumber || null,
          projectLabel: values.projectLabel || calendarEvent.projectLabel || null,
          contractId:
            values.contractId != null
              ? values.contractId
              : calendarEvent.contractId ?? null,
          contractVisible:
            values.contractVisible || calendarEvent.contractVisible || null,
        }),
      });
      const stampData = await stampRes.json().catch(() => ({}));
      if (!stampRes.ok) {
        throw new Error(
          stampData.error ||
            t("timekeeping.stampFailed")
        );
      }
      onOpenChange(false);
      onBooked?.(stampData.stamp ?? null);
      return;
    }
    onOpenChange(false);
    onBooked?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <MaringoTimeBookForm
          key={`${editLineId || "new"}-${defaults?.issueId || "x"}-${defaults?.projectNumber || ""}-${calendarEvent?.eventId || ""}-${open}`}
          defaults={defaults}
          submitLabel={resolvedSubmit}
          onSubmit={submit}
          attendeeEmails={attendeeEmails}
          subjectSuggestions={subjectSuggestions}
          initialHint={initialHint}
          preserveEventPrefillOnChips={preserveEventPrefillOnChips}
          hoursHint={hoursHint}
        />
      </DialogContent>
    </Dialog>
  );
}
