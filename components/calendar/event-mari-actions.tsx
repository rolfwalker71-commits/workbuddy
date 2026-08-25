"use client";

import Link from "next/link";
import { Clock3, FolderOpen, Ticket } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { eventHasEnded } from "@/lib/workspace/event-mari-shared";
import type { WorkspaceEventMari } from "@/lib/workspace/event-mari-shared";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import { cn } from "@/lib/utils";

export function EventMariActions({
  mari,
  eventDate,
  endTime,
  time,
  isAllDay,
}: {
  mari: WorkspaceEventMari;
  eventDate?: string | null;
  endTime?: string | null;
  time?: string | null;
  isAllDay?: boolean;
}) {
  const ended =
    eventDate != null &&
    eventHasEnded({
      date: eventDate,
      endTime,
      time,
      isAllDay,
      nowYmd: zurichYmd(),
      nowHm: zurichHm(),
    });
  const showBook = ended && mari.stampStatus === "pending";
  const ticketHref = `/maringo?open=${mari.issueId}`;
  const bookHref = `/maringo?open=${mari.issueId}&book=1`;
  const akteHref = mari.cardCode
    ? `/maringo?view=kunde&card=${encodeURIComponent(mari.cardCode)}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[0.625rem] font-semibold tabular-nums text-orange-950 ring-1 ring-orange-200/80 dark:bg-orange-500/15 dark:text-orange-100 dark:ring-orange-400/30">
        #{mari.issueId}
        {mari.statusName ? ` · ${mari.statusName}` : ""}
      </span>
      {akteHref ? (
        <Link
          href={akteHref}
          className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
        >
          <FolderOpen className="size-3" strokeWidth={APP_ICON_STROKE} />
          Akte
        </Link>
      ) : null}
      <Link
        href={ticketHref}
        className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
      >
        <Ticket className="size-3" strokeWidth={APP_ICON_STROKE} />
        Ticket
      </Link>
      {showBook ? (
        <Link href={bookHref} className={cn(buttonVariants({ size: "xs" }))}>
          <Clock3 className="size-3" strokeWidth={APP_ICON_STROKE} />
          Stunden buchen
        </Link>
      ) : null}
    </div>
  );
}
