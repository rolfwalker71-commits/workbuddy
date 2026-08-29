"use client";

import Link from "next/link";
import { Clock3, FolderOpen, Ticket } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useAuth } from "@/components/auth/auth-provider";
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
  provider,
  calendarType,
  onBookHours,
}: {
  mari?: WorkspaceEventMari | null;
  eventDate?: string | null;
  endTime?: string | null;
  time?: string | null;
  isAllDay?: boolean;
  provider?: string | null;
  calendarType?: string | null;
  onBookHours?: () => void;
}) {
  const { me } = useAuth();
  const maringoOn = me?.modules?.includes("maringo") ?? false;
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
  const hasTicket = mari != null && mari.issueId > 0;
  const booked = mari?.stampStatus === "booked";
  const showBook =
    maringoOn &&
    ended &&
    !booked &&
    provider !== "google" &&
    provider !== "buddy" &&
    calendarType !== "birthday" &&
    Boolean(onBookHours || hasTicket);
  const ticketHref = hasTicket ? `/maringo?open=${mari.issueId}` : null;
  const bookHref = hasTicket ? `/maringo?open=${mari.issueId}&book=1` : null;
  const akteHref =
    hasTicket && mari.cardCode
      ? `/maringo?view=kunde&card=${encodeURIComponent(mari.cardCode)}`
      : null;

  if (!hasTicket && !showBook) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasTicket ? (
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[0.625rem] font-semibold tabular-nums text-orange-950 ring-1 ring-orange-200/80 dark:bg-orange-500/15 dark:text-orange-100 dark:ring-orange-400/30">
          #{mari.issueId}
          {mari.statusName ? ` · ${mari.statusName}` : ""}
        </span>
      ) : null}
      {akteHref ? (
        <Link
          href={akteHref}
          className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
        >
          <FolderOpen className="size-3" strokeWidth={APP_ICON_STROKE} />
          Akte
        </Link>
      ) : null}
      {ticketHref ? (
        <Link
          href={ticketHref}
          className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
        >
          <Ticket className="size-3" strokeWidth={APP_ICON_STROKE} />
          Ticket
        </Link>
      ) : null}
      {showBook ? (
        onBookHours ? (
          <Button type="button" size="xs" onClick={onBookHours}>
            <Clock3 className="size-3" strokeWidth={APP_ICON_STROKE} />
            Stunden buchen
          </Button>
        ) : bookHref ? (
          <Link href={bookHref} className={cn(buttonVariants({ size: "xs" }))}>
            <Clock3 className="size-3" strokeWidth={APP_ICON_STROKE} />
            Stunden buchen
          </Link>
        ) : null
      ) : null}
    </div>
  );
}
