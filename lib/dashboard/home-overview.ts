import type { AuthContext } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import type { AppModule } from "@/lib/users/modules";
import {
  hasMicrosoftMailScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import type { MsCalendarEvent } from "@/lib/microsoft/calendar-review";
import {
  getInboxUnreadCount,
  getTodayMicrosoftMailExcerpt,
} from "@/lib/microsoft/mail-inbox";
import { getMsMailDayCached } from "@/lib/microsoft/mail-day-analysis-job";
import { isGoogleMailConnected } from "@/lib/google/oauth";
import {
  getGmailInboxExcerpt,
  getGmailInboxUnreadCount,
} from "@/lib/google/mail-inbox";
import { getGoogleMailDayCached } from "@/lib/google/mail-day-analysis-job";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  getMariTicketsWatchState,
  loadMariHomeTicketWatch,
} from "@/lib/mari/sync-tickets-if-due";
import type { MariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import { loadHomeTasksBundle, type HomeTasksBundle } from "./home-tasks";
import { fetchHomeWeatherCard, type HomeWeatherCard } from "@/lib/weather/fetch";
import { loadWorkspaceTodayEvents } from "@/lib/workspace/today-events";
import {
  mergeWorkspaceMailSamples,
  type WorkspaceMailSample,
  type WorkspaceTodayEvent,
} from "@/lib/workspace/merge-today";
import { HOME_PROVIDER_TIMEOUT_MS, withTimeout } from "./with-timeout";

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

function emptyTasks(
  partial?: Partial<HomeTasksBundle>
): HomeTasksBundle {
  return {
    microsoftConnected: false,
    hasMicrosoftScope: false,
    googleConnected: false,
    hasGoogleScope: false,
    items: [],
    ...partial,
  };
}

function cachedMailDay(
  cached: {
    dayIso: string;
    inboxCount: number;
    sentCount: number;
    finishedAt: string;
    analysis: { daySummary?: string | null };
  } | null
): HomeMailDaySummary | null {
  if (!cached) return null;
  return {
    dayIso: cached.dayIso,
    inboxCount: cached.inboxCount,
    sentCount: cached.sentCount,
    finishedAt: cached.finishedAt,
    headline: cached.analysis.daySummary?.trim()?.slice(0, 220) || null,
  };
}

function eventsFromToday(
  events: WorkspaceTodayEvent[],
  provider: "microsoft" | "google"
): HomeProviderBlock["events"] {
  return events
    .filter((e) => e.provider === provider)
    .map((e) => ({
      id: e.id,
      subject: e.title,
      startHm: e.time,
      endHm: e.endTime,
      location: e.location,
      isAllDay: e.isAllDay,
      done: Boolean(e.done),
    }));
}

function emptyTickets(): MariTicketsWatchState {
  return {
    configured: false,
    employeeNumber: null,
    lastPollAt: null,
    countsByStatus: [],
    total: 0,
    recentChanges: [],
  };
}

/**
 * Fast Home payload: greeting, weather, unread KPIs, tickets.
 * Does not wait on inbox dumps, calendar review, or task lists.
 */
export async function getHomeOverview(
  auth: AuthContext
): Promise<HomeOverviewPayload> {
  const modules = auth.modules;
  const userId = resolveAppUserId(auth);
  const today = zurichYmd();
  const showMs = modules.includes("microsoft");
  const showGoogle = modules.includes("google");
  const showMari = modules.includes("maringo");

  const msConnected = userId != null && showMs && isMicrosoftConnected(userId);
  const googleConnected =
    userId != null && showGoogle && isGoogleMailConnected(userId);
  const ownerKey =
    userId != null ? `user:${userId}` : ownerKeyFromAuth(auth);

  const unreadMsPromise =
    userId != null && msConnected && hasMicrosoftMailScope(userId)
      ? withTimeout(
          getInboxUnreadCount(userId),
          HOME_PROVIDER_TIMEOUT_MS,
          null
        )
      : Promise.resolve(null);

  const unreadGooglePromise =
    userId != null && googleConnected
      ? withTimeout(
          getGmailInboxUnreadCount(userId),
          HOME_PROVIDER_TIMEOUT_MS,
          null
        )
      : Promise.resolve(null);

  const weatherPromise = withTimeout(
    fetchHomeWeatherCard(userId),
    HOME_PROVIDER_TIMEOUT_MS,
    null
  );

  const ticketsPromise = showMari
    ? withTimeout(
        userId != null
          ? loadMariHomeTicketWatch({ userId, ownerKey })
          : Promise.resolve(emptyTickets()),
        HOME_PROVIDER_TIMEOUT_MS,
        getMariTicketsWatchState(ownerKey)
      )
    : Promise.resolve(null);

  const [unreadCount, googleUnread, weather, tickets] = await Promise.all([
    unreadMsPromise,
    unreadGooglePromise,
    weatherPromise,
    ticketsPromise,
  ]);

  const microsoft: HomeOverviewPayload["microsoft"] = showMs
    ? {
        enabled: true,
        connected: msConnected,
        events: [],
        mailInbox: [],
        unreadCount,
        mailDay:
          userId != null && msConnected
            ? cachedMailDay(getMsMailDayCached(userId, today))
            : null,
        tasks: emptyTasks({ microsoftConnected: msConnected }),
      }
    : null;

  const google: HomeOverviewPayload["google"] = showGoogle
    ? {
        enabled: true,
        connected: googleConnected,
        events: [],
        mailInbox: [],
        unreadCount: googleUnread,
        mailDay:
          userId != null && googleConnected
            ? cachedMailDay(getGoogleMailDayCached(userId, today))
            : null,
        tasks: emptyTasks({ googleConnected }),
      }
    : null;

  return {
    greetingName: auth.username,
    today,
    modules,
    microsoft,
    google,
    todayEvents: [],
    todayMail: [],
    maringo: showMari
      ? { enabled: true, tickets: tickets ?? emptyTickets() }
      : null,
    weather,
  };
}

/**
 * Heavier Home sections after first paint: calendar, mail samples, tasks.
 * Each provider call is independently timed out.
 */
export async function getHomeDetails(
  auth: AuthContext
): Promise<HomeDetailsPayload> {
  const modules = auth.modules;
  const userId = resolveAppUserId(auth);
  const showMs = modules.includes("microsoft");
  const showGoogle = modules.includes("google");
  const msConnected = userId != null && showMs && isMicrosoftConnected(userId);
  const googleConnected =
    userId != null && showGoogle && isGoogleMailConnected(userId);

  if (userId == null || (!showMs && !showGoogle)) {
    return {
      microsoft: showMs
        ? { events: [], mailInbox: [], tasks: emptyTasks() }
        : null,
      google: showGoogle
        ? { events: [], mailInbox: [], tasks: emptyTasks() }
        : null,
      todayEvents: [],
      todayMail: [],
    };
  }

  const [todayEvents, msMail, googleMail, tasks] = await Promise.all([
    showMs || showGoogle
      ? withTimeout(
          loadWorkspaceTodayEvents(userId, {
            wantMicrosoft: showMs,
            wantGoogle: showGoogle,
          }),
          HOME_PROVIDER_TIMEOUT_MS,
          [] as WorkspaceTodayEvent[]
        )
      : Promise.resolve([] as WorkspaceTodayEvent[]),
    msConnected && hasMicrosoftMailScope(userId)
      ? withTimeout(
          getTodayMicrosoftMailExcerpt(userId, 4).then((items) =>
            items.map(
              (m): HomeMailSample => ({
                id: m.id,
                subject: m.subject || "(kein Betreff)",
                from: m.fromName || m.from || "Outlook",
                receivedOrSentAt: m.date,
                provider: "microsoft",
              })
            )
          ),
          HOME_PROVIDER_TIMEOUT_MS,
          [] as HomeMailSample[]
        )
      : Promise.resolve([] as HomeMailSample[]),
    googleConnected
      ? withTimeout(
          getGmailInboxExcerpt(userId, 4).then((items) =>
            items.map(
              (m): HomeMailSample => ({
                ...m,
                provider: "google",
              })
            )
          ),
          HOME_PROVIDER_TIMEOUT_MS,
          [] as HomeMailSample[]
        )
      : Promise.resolve([] as HomeMailSample[]),
    showMs || showGoogle
      ? withTimeout(
          loadHomeTasksBundle(userId),
          HOME_PROVIDER_TIMEOUT_MS,
          emptyTasks({
            microsoftConnected: msConnected,
            googleConnected,
          })
        )
      : Promise.resolve(emptyTasks()),
  ]);

  const todayMail = mergeWorkspaceMailSamples(
    msMail.map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from,
      receivedOrSentAt: m.receivedOrSentAt,
      provider: "microsoft" as const,
    })),
    googleMail.map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from,
      receivedOrSentAt: m.receivedOrSentAt,
      provider: "google" as const,
    }))
  );

  return {
    microsoft: showMs
      ? {
          events: eventsFromToday(todayEvents, "microsoft"),
          mailInbox: msMail,
          tasks,
        }
      : null,
    google: showGoogle
      ? {
          events: eventsFromToday(todayEvents, "google"),
          mailInbox: googleMail,
          tasks,
        }
      : null,
    todayEvents,
    todayMail,
  };
}

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
