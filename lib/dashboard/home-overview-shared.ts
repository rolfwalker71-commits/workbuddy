/**
 * Client-safe Home overview types and merge helper.
 * No db / OAuth / Node-only imports — keep this out of server data loaders.
 */

import type { AppModule } from "@/lib/users/modules";
import type { MsCalendarEvent } from "@/lib/microsoft/calendar-review";
import type { MariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import type { HomeTasksBundle } from "./home-tasks";
import type { HomeWeatherCard } from "@/lib/weather/fetch";
import type {
  WorkspaceMailSample,
  WorkspaceTodayEvent,
} from "@/lib/workspace/merge-today";
import type {
  HomeAbsenceState,
  HomePendingStamp,
  HomeTicketRow,
  HomeTtvDutyState,
} from "@/lib/dashboard/home-surfaces-shared";

export type HomeMailSample = {
  id: string;
  subject: string;
  from: string;
  receivedOrSentAt: string | null;
  provider?: "microsoft" | "google";
};

export type HomeMailDaySummary = {
  dayIso: string;
  inboxCount: number;
  sentCount: number;
  finishedAt: string;
  headline: string | null;
};

export type HomeTeamsSnippet = {
  chatId: string;
  title: string;
  preview: string | null;
  lastUpdatedAt: string | null;
};

export type HomeProviderBlock = {
  enabled: boolean;
  connected: boolean;
  events: MsCalendarEvent[] | Array<{
    id: string;
    subject: string;
    date: string;
    startHm: string | null;
    endHm: string | null;
    location: string | null;
    isAllDay: boolean;
    done: boolean;
  }>;
  mailInbox: HomeMailSample[];
  unreadCount: number | null;
  mailDay: HomeMailDaySummary | null;
  tasks: HomeTasksBundle;
  lastTeams?: HomeTeamsSnippet | null;
  teamsEnabled?: boolean;
};

export type HomeOverviewPayload = {
  greetingName: string | null;
  today: string;
  modules: AppModule[];
  microsoft: HomeProviderBlock | null;
  google: HomeProviderBlock | null;
  todayEvents: WorkspaceTodayEvent[];
  todayMail: WorkspaceMailSample[];
  maringo: {
    enabled: boolean;
    tickets: MariTicketsWatchState;
    ticketRows?: HomeTicketRow[];
    ttvInboxCount?: number;
  } | null;
  weather: HomeWeatherCard | null;
  ttvDuty: HomeTtvDutyState | null;
  absence: HomeAbsenceState | null;
  pendingStamps?: HomePendingStamp[];
};

export type HomeDetailsPayload = {
  microsoft: Pick<
    HomeProviderBlock,
    "events" | "mailInbox" | "tasks" | "lastTeams"
  > | null;
  google: Pick<HomeProviderBlock, "events" | "mailInbox" | "tasks"> | null;
  todayEvents: WorkspaceTodayEvent[];
  todayMail: WorkspaceMailSample[];
  pendingStamps?: HomePendingStamp[];
};

export function mergeHomeOverviewDetails(
  overview: HomeOverviewPayload,
  details: HomeDetailsPayload
): HomeOverviewPayload {
  return {
    ...overview,
    microsoft:
      overview.microsoft && details.microsoft
        ? {
            ...overview.microsoft,
            events: details.microsoft.events,
            mailInbox: details.microsoft.mailInbox,
            tasks: details.microsoft.tasks,
            lastTeams:
              details.microsoft.lastTeams ?? overview.microsoft.lastTeams,
          }
        : overview.microsoft,
    google:
      overview.google && details.google
        ? {
            ...overview.google,
            events: details.google.events,
            mailInbox: details.google.mailInbox,
            tasks: details.google.tasks,
          }
        : overview.google,
    todayEvents: details.todayEvents,
    todayMail: details.todayMail,
    pendingStamps: details.pendingStamps ?? overview.pendingStamps,
  };
}

export type HomeKpiLive = {
  microsoftUnread: number | null;
  googleUnread: number | null;
  weather: HomeWeatherCard | null;
};

export function mergeHomeKpis(
  overview: HomeOverviewPayload,
  kpis: HomeKpiLive
): HomeOverviewPayload {
  return {
    ...overview,
    weather: kpis.weather ?? overview.weather,
    microsoft: overview.microsoft
      ? {
          ...overview.microsoft,
          unreadCount:
            kpis.microsoftUnread != null
              ? kpis.microsoftUnread
              : overview.microsoft.unreadCount,
        }
      : overview.microsoft,
    google: overview.google
      ? {
          ...overview.google,
          unreadCount:
            kpis.googleUnread != null
              ? kpis.googleUnread
              : overview.google.unreadCount,
        }
      : overview.google,
  };
}

export function mergeHomeMaringoTickets(
  overview: HomeOverviewPayload,
  tickets: MariTicketsWatchState,
  extra?: { ticketRows?: HomeTicketRow[]; ttvInboxCount?: number }
): HomeOverviewPayload {
  if (!overview.maringo) return overview;
  return {
    ...overview,
    maringo: {
      ...overview.maringo,
      tickets,
      ticketRows: extra?.ticketRows ?? overview.maringo.ticketRows,
      ttvInboxCount: extra?.ttvInboxCount ?? overview.maringo.ttvInboxCount,
    },
  };
}
