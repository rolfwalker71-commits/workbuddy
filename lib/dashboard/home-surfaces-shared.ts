/**
 * Client-safe Home extras: TTV duty, absence, ticket rows, pending stamps.
 */

import type {
  HomePendingStamp,
  WorkspaceEventMari,
} from "@/lib/workspace/event-mari-shared";

export type HomeTtvDutyState = {
  ymd: string;
  userId: number | null;
  displayName: string | null;
  source: "admin" | "claim" | null;
  isMe: boolean;
  ttvInboxHref: string;
};

export type HomeAbsenceColleague = {
  userId: number;
  displayName: string;
  message: string | null;
};

export type HomeAbsenceState = {
  today: string;
  self: {
    fromYmd: string;
    toYmd: string;
    message: string | null;
    isAwayToday: boolean;
  } | null;
  colleagues: HomeAbsenceColleague[];
};

export type HomeTicketRow = {
  issueId: number;
  briefDescription: string;
  dueDate: string | null;
  status: number;
  statusName: string;
  cardCode: string | null;
  addressMatchcode: string | null;
  overdue: boolean;
};

export type { HomePendingStamp, WorkspaceEventMari };
