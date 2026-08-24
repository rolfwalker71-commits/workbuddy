"use client";

import type { ReactNode } from "react";
import { ExternalLink, MapPin, Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EventMapSnippet } from "@/components/calendar/event-map-snippet";
import { resolveEventArt, type EventArtSubject } from "@/lib/calendar/event-art";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";
import { ProviderBadge } from "@/components/workspace/provider-badge";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

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
};

export function EventDetailDialog({
  event,
  open,
  onOpenChange,
  actions,
}: {
  event: EventDetailModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: ReactNode;
}) {
  const art = event ? resolveEventArt(event) : null;
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
              {art.left ? (
                <img
                  src={art.left.src}
                  alt={art.left.alt}
                  className="absolute bottom-3 left-3 size-16 rounded-xl object-cover shadow-md ring-2 ring-white/80"
                />
              ) : null}
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
                  {event.title}
                </DialogTitle>
                <DialogDescription>
                  {event.date ? `${toSwissDate(event.date)} · ` : ""}
                  {when}
                </DialogDescription>
              </DialogHeader>

              {event.location ? (
                <p className="flex items-start gap-1.5 text-sm">
                  <MapPin
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={APP_ICON_STROKE}
                  />
                  <span>{event.location}</span>
                </p>
              ) : null}

              {event.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {event.description}
                </p>
              ) : null}

              {isPhysicalAgendaLocation(event.location) ? (
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

              {actions ? <div className="space-y-2">{actions}</div> : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
