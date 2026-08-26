"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, MapPin, Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EventMapSnippet } from "@/components/calendar/event-map-snippet";
import { MeetingTranscriptPanel } from "@/components/microsoft/meeting-transcript-panel";
import { resolveEventArt, type EventArtSubject } from "@/lib/calendar/event-art";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";
import { ProviderBadge } from "@/components/workspace/provider-badge";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export type EventEditValues = {
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  isAllDay: boolean;
  location: string;
  description: string;
};

export type EventDetailModel = EventArtSubject & {
  title: string;
  time?: string | null;
  endTime?: string | null;
  date?: string;
  isAllDay?: boolean;
  done?: boolean;
  webLink?: string | null;
  provider?: WorkspaceProvider;
  location?: string | null;
  calendarId?: string | null;
  meetUrl?: string | null;
  mari?: { issueId?: number | null } | null;
};

export function EventDetailDialog({
  event,
  open,
  onOpenChange,
  actions,
  canEdit,
  saving,
  onSave,
}: {
  event: EventDetailModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: ReactNode;
  canEdit?: boolean;
  saving?: boolean;
  onSave?: (values: EventEditValues) => Promise<void> | void;
}) {
  const art = event ? resolveEventArt(event) : null;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!event) return;
    setTitle(event.title || "");
    setDate(event.date || "");
    setTime(event.time || "09:00");
    setEndTime(event.endTime || event.time || "10:00");
    setIsAllDay(Boolean(event.isAllDay) || !event.time);
    setLocation(event.location || "");
    setDescription(event.description || "");
  }, [event]);
  const when = event
    ? event.isAllDay
      ? "Ganztägig"
      : [event.time, event.endTime].filter(Boolean).join("–") || "Heute"
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-md"
        showCloseButton
      >
        {event && art ? (
          <>
            <div className="relative overflow-hidden rounded-t-xl">
              <img
                src={art.right.src}
                alt={art.right.alt}
                className="h-36 w-full object-cover sm:h-44"
              />
            </div>
            <div className="space-y-4 p-4">
              <DialogHeader className="gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {event.provider ? (
                    <ProviderBadge provider={event.provider} kind="calendar" />
                  ) : null}
                  <Badge variant="secondary" className="text-[0.625rem]">
                    {art.right.label}
                  </Badge>
                  {event.done ? (
                    <Badge variant="secondary" className="text-[0.625rem]">
                      Erledigt
                    </Badge>
                  ) : null}
                </div>
                <DialogTitle className="text-lg font-bold leading-snug">
                  {canEdit ? "Termin bearbeiten" : event.title}
                </DialogTitle>
                <DialogDescription>
                  {canEdit
                    ? "Titel, Zeit, Ort und Notiz speichern."
                    : `${event.date ? `${toSwissDate(event.date)} · ` : ""}${when}`}
                </DialogDescription>
              </DialogHeader>

              {canEdit ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onSave?.({
                      title: title.trim(),
                      date,
                      time: isAllDay ? null : time,
                      endTime: isAllDay ? null : endTime,
                      isAllDay,
                      location: location.trim(),
                      description: description.trim(),
                    });
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="event-edit-title">Titel</Label>
                    <Input
                      id="event-edit-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                      disabled={saving}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="event-edit-date">Datum</Label>
                      <Input
                        id="event-edit-date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <label className="flex items-end gap-2 pb-1 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-teal-700"
                        checked={isAllDay}
                        disabled={saving}
                        onChange={(e) => setIsAllDay(e.target.checked)}
                      />
                      Ganztägig
                    </label>
                  </div>
                  {!isAllDay ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="event-edit-start">Von</Label>
                        <Input
                          id="event-edit-start"
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="event-edit-end">Bis</Label>
                        <Input
                          id="event-edit-end"
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="event-edit-location">Ort</Label>
                    <Input
                      id="event-edit-location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      maxLength={300}
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-edit-notes">Notiz</Label>
                    <Textarea
                      id="event-edit-notes"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      maxLength={4000}
                      disabled={saving}
                      className="resize-y text-[0.8125rem]"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={saving || !title.trim() || !date}
                    className="w-full"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    Änderungen speichern
                  </Button>
                </form>
              ) : event.location ? (
                <p className="flex items-start gap-1.5 text-sm">
                  <MapPin
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={APP_ICON_STROKE}
                  />
                  <span>{event.location}</span>
                </p>
              ) : null}

              {!canEdit && event.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {event.description}
                </p>
              ) : null}

              {isPhysicalAgendaLocation(canEdit ? location : event.location) ? (
                <EventMapSnippet location={event.location} />
              ) : null}

              <div className="flex flex-wrap gap-2">
                {event.meetUrl ? (
                  <a
                    href={event.meetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                    )}
                  >
                    <Video className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                    Meeting öffnen
                  </a>
                ) : null}
                {event.webLink ? (
                  <a
                    href={event.webLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium"
                  >
                    Im Kalender
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>

              {event.provider === "microsoft" &&
              (event.meetUrl || event.id) ? (
                <MeetingTranscriptPanel
                  eventId={event.id}
                  joinUrl={event.meetUrl}
                  calendarId={event.calendarId}
                  issueId={event.mari?.issueId ?? null}
                  compact
                />
              ) : null}

              {actions ? <div className="space-y-2">{actions}</div> : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
