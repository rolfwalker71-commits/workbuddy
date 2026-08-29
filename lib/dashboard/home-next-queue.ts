/**
 * Client-safe ranking for Home «Was als Nächstes?».
 */

import { eventHasEnded, minutesUntilHm } from "@/lib/workspace/event-mari-shared";
import type { HomePendingStamp } from "@/lib/workspace/event-mari-shared";
import type { HomeTaskItem } from "@/lib/dashboard/home-tasks";
import type { HomeTicketRow } from "@/lib/dashboard/home-surfaces-shared";
import type { WorkspaceTodayEvent } from "@/lib/workspace/merge-today";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

export type HomeNextQueueKind =
  | "event-soon"
  | "ticket-overdue"
  | "hours-pending"
  | "ttv-inbox"
  | "task-overdue";

export type HomeNextQueueItem = {
  id: string;
  kind: HomeNextQueueKind;
  title: string;
  detail: string;
  href: string;
  rank: number;
};

const KIND_RANK: Record<HomeNextQueueKind, number> = {
  "event-soon": 10,
  "ticket-overdue": 20,
  "hours-pending": 30,
  "ttv-inbox": 40,
  "task-overdue": 50,
};

export function buildHomeNextQueue(input: {
  nowYmd: string;
  nowHm: string;
  events: WorkspaceTodayEvent[];
  tickets: HomeTicketRow[];
  pendingStamps: HomePendingStamp[];
  tasks: HomeTaskItem[];
  ttvInboxCount: number;
  iAmTtv: boolean;
  locale?: Locale;
}): HomeNextQueueItem[] {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const items: HomeNextQueueItem[] = [];

  const soonEvent = input.events
    .map((event) => {
      if (event.done || event.isAllDay) return null;
      const until = minutesUntilHm(event.time, input.nowHm);
      if (until == null || until < 0 || until > 45) return null;
      return { event, until };
    })
    .filter((row): row is { event: WorkspaceTodayEvent; until: number } => row != null)
    .sort((a, b) => a.until - b.until)[0];

  if (soonEvent) {
    const { event, until } = soonEvent;
    const ticket = event.mari
      ? `#${event.mari.issueId} ${event.mari.briefDescription || event.title}`
      : event.title;
    const href = event.mari
      ? `/maringo?open=${event.mari.issueId}`
      : "/microsoft?tab=calendar";
    items.push({
      id: `event-soon:${event.provider}:${event.id}`,
      kind: "event-soon",
      title: `${event.time} ${ticket}`,
      detail: event.mari
        ? translate(locale, "home.eventInMinTicket", { count: until })
        : translate(locale, "home.eventInMin", { count: until }),
      href: event.mari?.cardCode
        ? `/maringo?view=kunde&card=${encodeURIComponent(event.mari.cardCode)}`
        : href,
      rank: KIND_RANK["event-soon"] - (event.mari ? 2 : 0),
    });
  }

  for (const ticket of input.tickets) {
    if (!ticket.overdue && ticket.dueDate !== input.nowYmd) continue;
    items.push({
      id: `ticket:${ticket.issueId}`,
      kind: "ticket-overdue",
      title: `#${ticket.issueId} ${ticket.briefDescription}`,
      detail: ticket.overdue
        ? translate(locale, "home.ticketOverdue", { status: ticket.statusName })
        : translate(locale, "home.ticketDueToday", { status: ticket.statusName }),
      href: `/maringo?open=${ticket.issueId}`,
      rank: KIND_RANK["ticket-overdue"] + (ticket.overdue ? 0 : 2),
    });
  }

  for (const stamp of input.pendingStamps) {
    const ended = eventHasEnded({
      date: stamp.eventDate,
      endTime: stamp.endHm,
      time: stamp.startHm,
      nowYmd: input.nowYmd,
      nowHm: input.nowHm,
    });
    if (!ended) continue;
    const hours =
      stamp.hours != null
        ? translate(locale, "home.bookHoursAmount", { hours: stamp.hours.toFixed(2) })
        : translate(locale, "home.bookHours");
    items.push({
      id: `hours:${stamp.eventId}`,
      kind: "hours-pending",
      title: `${stamp.startHm || ""} ${stamp.briefDescription || stamp.title}`.trim(),
      detail: hours,
      href: `/maringo?open=${stamp.issueId}&book=1`,
      rank: KIND_RANK["hours-pending"],
    });
  }

  if (input.ttvInboxCount > 0) {
    items.push({
      id: "ttv-inbox",
      kind: "ttv-inbox",
      title: translate(locale, "home.ttvInbox"),
      detail: input.iAmTtv
        ? translate(locale, "home.ttvNewTickets", { count: input.ttvInboxCount })
        : translate(locale, "home.ttvNewTicketsFallback", {
            count: input.ttvInboxCount,
          }),
      href: "/maringo?filter=ttv",
      rank: KIND_RANK["ttv-inbox"] - (input.iAmTtv ? 5 : 0),
    });
  }

  for (const task of input.tasks) {
    if (!task.overdue) continue;
    items.push({
      id: `task:${task.key}`,
      kind: "task-overdue",
      title: task.title,
      detail: translate(locale, "home.taskOverdue", {
        label: task.subtitle || task.accountLabel,
      }),
      href: task.href,
      rank: KIND_RANK["task-overdue"],
    });
  }

  return items
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.title.localeCompare(b.title, locale === "en" ? "en" : "de");
    })
    .slice(0, 6);
}
