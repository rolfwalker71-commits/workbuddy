"use client";

import type { ReactNode } from "react";
import { resolveEventArt, type EventArtSubject } from "@/lib/calendar/event-art";
import { HoursSplitBagel } from "@/components/ui/hours-split-bagel";
import { ProviderBadge } from "@/components/workspace/provider-badge";
import {
  hoursSplitFromStamp,
  type WorkspaceEventMari,
} from "@/lib/workspace/event-mari-shared";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";
import { cn } from "@/lib/utils";

export type EventArtCardModel = EventArtSubject & {
  title: string;
  time?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  done?: boolean;
  provider?: WorkspaceProvider;
  location?: string | null;
  mari?: WorkspaceEventMari | null;
};

function EventArtCardHeader({ event }: { event: EventArtCardModel }) {
  const art = resolveEventArt(event);
  const when = event.isAllDay
    ? "Ganztägig"
    : [event.time, event.endTime].filter(Boolean).join("–") || "Heute";
  const booked = event.mari?.stampStatus === "booked";
  const split = booked
    ? hoursSplitFromStamp(event.mari?.hours, event.mari?.hoursBillable)
    : null;
  return (
    <>
      <span className="min-w-0 flex-1 px-3 py-2.5">
        {event.provider ? (
          <span className="mb-0.5 block">
            <ProviderBadge provider={event.provider} kind="calendar" />
          </span>
        ) : null}
        <span className="block break-words text-sm font-semibold leading-snug">
          {event.title}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {when}
          {art.right.label ? ` · ${art.right.label}` : ""}
          {event.location ? ` · ${event.location}` : ""}
        </span>
      </span>
      {split ? (
        <span className="flex shrink-0 items-center self-center pr-1.5">
          <HoursSplitBagel
            billable={split.billable}
            nonBillable={split.nonBillable}
            size="lg"
          />
        </span>
      ) : null}
      <img
        src={art.right.src}
        alt={art.right.alt}
        className="h-[4.75rem] w-[5.25rem] shrink-0 object-cover sm:h-[5.25rem] sm:w-[6rem]"
      />
    </>
  );
}

export function EventArtCard({
  event,
  onOpen,
  className,
  footer,
}: {
  event: EventArtCardModel;
  onOpen?: () => void;
  className?: string;
  footer?: ReactNode;
}) {
  const cardClass = cn(
    "flex w-full items-stretch overflow-hidden rounded-2xl bg-card text-left shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1 ring-border/50",
    event.done && "opacity-70",
    className
  );
  const bar = (
    <span className="w-2 shrink-0 self-stretch bg-sky-400/80" aria-hidden />
  );

  if (!footer) {
    const Tag = onOpen ? "button" : "div";
    return (
      <Tag
        type={onOpen ? "button" : undefined}
        onClick={onOpen}
        className={cn(cardClass, onOpen && "transition-shadow hover:shadow-md")}
      >
        {bar}
        <EventArtCardHeader event={event} />
      </Tag>
    );
  }

  return (
    <div className={cardClass}>
      {bar}
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-stretch text-left hover:bg-muted"
          >
            <EventArtCardHeader event={event} />
          </button>
        ) : (
          <div className="flex items-stretch">
            <EventArtCardHeader event={event} />
          </div>
        )}
        <div
          className="mx-3 border-t border-border/60"
          role="separator"
        />
        <div className="px-3 py-2.5">{footer}</div>
      </div>
    </div>
  );
}
