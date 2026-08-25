import { hasMariConfig } from "@/lib/mari/config";
import {
  getMariCalendarStamp,
  listPendingMariCalendarStamps,
  parseMariIssueIdFromBody,
  parseMariIssueIdFromCategories,
  type MariCalendarStamp,
} from "@/lib/mari/calendar-stamp";
import { listMyTickets, type MariTicketListItem } from "@/lib/mari/tickets";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";
import type {
  HomePendingStamp,
  WorkspaceEventMari,
} from "@/lib/workspace/event-mari-shared";

export type {
  HomePendingStamp,
  WorkspaceEventMari,
} from "@/lib/workspace/event-mari-shared";

export type EventMariLinkSource = {
  id: string;
  provider?: WorkspaceProvider | string | null;
  description?: string | null;
  categories?: string[] | null;
};

function issueIdFromEvent(event: EventMariLinkSource): number | null {
  const fromCat = parseMariIssueIdFromCategories(event.categories);
  if (fromCat) return fromCat;
  return parseMariIssueIdFromBody(event.description);
}

async function ticketsByIssueIds(
  ids: number[]
): Promise<Map<number, MariTicketListItem>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0 || !hasMariConfig()) return new Map();
  try {
    const rows = await listMyTickets({ issueIds: unique, limit: unique.length });
    return new Map(rows.map((t) => [t.issueId, t]));
  } catch (err) {
    console.warn(
      "[mari] event ticket join failed:",
      err instanceof Error ? err.message : err
    );
    return new Map();
  }
}

function mariFromParts(
  issueId: number,
  stamp: MariCalendarStamp | null,
  ticket: MariTicketListItem | undefined
): WorkspaceEventMari {
  return {
    issueId,
    stampStatus: stamp?.status ?? null,
    hours: stamp?.hours ?? null,
    cardCode: ticket?.cardCode ?? null,
    briefDescription: ticket?.briefDescription ?? null,
    status: ticket?.status ?? null,
    statusName: ticket?.statusName ?? null,
  };
}

export async function attachMariToEvents<T extends EventMariLinkSource>(
  userId: number | null,
  events: T[]
): Promise<Array<T & { mari: WorkspaceEventMari | null }>> {
  if (userId == null || events.length === 0 || !hasMariConfig()) {
    return events.map((event) => ({ ...event, mari: null }));
  }

  const stamps: Array<MariCalendarStamp | null> = events.map((event) => {
    if (event.provider && event.provider !== "microsoft") return null;
    try {
      return getMariCalendarStamp(userId, "microsoft", event.id);
    } catch {
      return null;
    }
  });

  const issueIds = events.map((event, i) => {
    return stamps[i]?.issueId ?? issueIdFromEvent(event);
  });
  const tickets = await ticketsByIssueIds(
    issueIds.filter((id): id is number => id != null)
  );

  return events.map((event, i) => {
    const stamp = stamps[i];
    const issueId = stamp?.issueId ?? issueIds[i];
    if (issueId == null) return { ...event, mari: null };
    return {
      ...event,
      mari: mariFromParts(issueId, stamp, tickets.get(issueId)),
    };
  });
}

export async function listHomePendingStamps(
  userId: number,
  todayYmd: string
): Promise<HomePendingStamp[]> {
  if (!hasMariConfig()) return [];
  let stamps: MariCalendarStamp[] = [];
  try {
    stamps = listPendingMariCalendarStamps(userId, {
      onOrBeforeDate: todayYmd,
    });
  } catch {
    return [];
  }
  const tickets = await ticketsByIssueIds(stamps.map((s) => s.issueId));
  return stamps.slice(0, 20).map((stamp) => {
    const ticket = tickets.get(stamp.issueId);
    return {
      eventId: stamp.eventId,
      issueId: stamp.issueId,
      title: stamp.title,
      eventDate: stamp.eventDate,
      startHm: stamp.startHm,
      endHm: stamp.endHm,
      hours: stamp.hours,
      cardCode: ticket?.cardCode ?? null,
      briefDescription: ticket?.briefDescription ?? null,
    };
  });
}
