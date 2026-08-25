/**
 * Client-safe ranking for Home «Was als Nächstes?».
 */

import { eventHasEnded, minutesUntilHm } from "@/lib/workspace/event-mari-shared";
import type { HomePendingStamp } from "@/lib/workspace/event-mari-shared";
import type { HomeTaskItem } from "@/lib/dashboard/home-tasks";
import type { HomeTicketRow } from "@/lib/dashboard/home-surfaces-shared";
import type { WorkspaceTodayEvent } from "@/lib/workspace/merge-today";

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
}): HomeNextQueueItem[] {
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
        ? `Termin in ${until} Min · Ticket · Akte`
        : `Termin in ${until} Min`,
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
        ? `${ticket.statusName} · überfällig`
        : `${ticket.statusName} · heute fällig`,
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
      stamp.hours != null ? `${stamp.hours.toFixed(2)} h buchen` : "Stunden buchen";
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
      title: "TTV-Inbox",
      detail: input.iAmTtv
        ? `${input.ttvInboxCount} neue Tickets`
        : `${input.ttvInboxCount} neue Tickets (Fallback-Filter)`,
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
      detail: `${task.subtitle || task.accountLabel} · überfällig`,
      href: task.href,
      rank: KIND_RANK["task-overdue"],
    });
  }

  return items
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.title.localeCompare(b.title, "de");
    })
    .slice(0, 6);
}
