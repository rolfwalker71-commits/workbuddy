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

export type HomeProviderBlock = {
  enabled: boolean;
  connected: boolean;
  events: MsCalendarEvent[] | Array<{
    id: string;
    subject: string;
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
  } | null;
  weather: HomeWeatherCard | null;
};

export type HomeDetailsPayload = {
  microsoft: Pick<HomeProviderBlock, "events" | "mailInbox" | "tasks"> | null;
  google: Pick<HomeProviderBlock, "events" | "mailInbox" | "tasks"> | null;
  todayEvents: WorkspaceTodayEvent[];
  todayMail: WorkspaceMailSample[];
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
  };
}
