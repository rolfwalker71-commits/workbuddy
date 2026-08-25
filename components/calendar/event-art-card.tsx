"use client";

import { resolveEventArt, type EventArtSubject } from "@/lib/calendar/event-art";
import { ProviderBadge } from "@/components/workspace/provider-badge";
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
};

export function EventArtCard({
  event,
  onOpen,
  className,
}: {
  event: EventArtCardModel;
  onOpen?: () => void;
  className?: string;
}) {
  const art = resolveEventArt(event);
  const when = event.isAllDay
    ? "Ganztägig"
    : [event.time, event.endTime].filter(Boolean).join("–") || "Heute";
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      type={onOpen ? "button" : undefined}
      onClick={onOpen}
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-2xl bg-card text-left shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1 ring-border/50",
        onOpen && "transition-shadow hover:shadow-md",
        event.done && "opacity-70",
        className
      )}
    >
      <span
        className="w-2 shrink-0 self-stretch bg-sky-400/80"
        aria-hidden
      />
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
      <img
        src={art.right.src}
        alt={art.right.alt}
        className="h-[4.75rem] w-[5.25rem] shrink-0 object-cover sm:h-[5.25rem] sm:w-[6rem]"
      />
    </Tag>
  );
}
