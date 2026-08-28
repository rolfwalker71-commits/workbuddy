import type { AuthContext } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import {
  hasMicrosoftChatScope,
  hasMicrosoftMailScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { getLatestTeamsChatSnippet } from "@/lib/microsoft/teams-chats";
import { isUserTeamsEnabled } from "@/lib/microsoft/teams-prefs";
import { countTeamsThreadsByInbox } from "@/lib/microsoft/teams-thread-state";
import {
  getInboxUnreadCount,
  getTodayMicrosoftMailExcerpt,
} from "@/lib/microsoft/mail-inbox";
import {
  readHomeKpiCache,
  writeHomeUnreadCache,
  writeHomeWeatherCache,
} from "./home-kpi-cache";
import { getMsMailDayCached } from "@/lib/microsoft/mail-day-analysis-job";
import { isGoogleMailConnected } from "@/lib/google/oauth";
import {
  getGmailInboxExcerpt,
  getGmailInboxUnreadCount,
} from "@/lib/google/mail-inbox";
import { getGoogleMailDayCached } from "@/lib/google/mail-day-analysis-job";
import { zurichYmd } from "@/lib/microsoft/time";
import { syncOofPresenceForUser } from "@/lib/presence/oof-sync";
import { getMariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import type { MariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import {
  listMariTicketSavedViews,
  mariTicketSavedViewHref,
} from "@/lib/mari/ticket-saved-views";
import { loadHomeTasksBundle, type HomeTasksBundle } from "./home-tasks";
import { fetchHomeWeatherCard } from "@/lib/weather/fetch";
import { loadWorkspaceTodayEvents } from "@/lib/workspace/today-events";
import {
  mergeWorkspaceMailSamples,
  type WorkspaceTodayEvent,
} from "@/lib/workspace/merge-today";
import { HOME_PROVIDER_TIMEOUT_MS, withTimeout } from "./with-timeout";
import type {
  HomeDetailsPayload,
  HomeKpiLive,
  HomeMailDaySummary,
  HomeMailSample,
  HomeOverviewPayload,
  HomeProviderBlock,
} from "./home-overview-shared";
import {
  attachMariToEvents,
  listHomePendingStamps,
} from "@/lib/workspace/event-mari";
import { getTtvDutyForDay } from "@/lib/mari/ttv-duty";
import {
  getUserAbsence,
  isAbsentOn,
  listAbsencesOnDay,
} from "@/lib/users/absence";
import type {
  HomeAbsenceState,
  HomeTtvDutyState,
} from "@/lib/dashboard/home-surfaces-shared";

export type {
  HomeDetailsPayload,
  HomeMailDaySummary,
  HomeMailSample,
  HomeOverviewPayload,
  HomeProviderBlock,
} from "./home-overview-shared";
export { mergeHomeOverviewDetails } from "./home-overview-shared";

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
      date: e.date,
      startHm: e.time,
      endHm: e.endTime,
      location: e.location,
      isAllDay: e.isAllDay,
      done: Boolean(e.done),
    }));
}

function homeTtvDuty(userId: number | null, today: string): HomeTtvDutyState {
  const duty = getTtvDutyForDay(today);
  return {
    ymd: today,
    userId: duty?.userId ?? null,
    displayName: duty?.displayName ?? null,
    source: duty?.source ?? null,
    isMe: duty != null && userId != null && duty.userId === userId,
    ttvInboxHref: "/maringo?filter=ttv",
  };
}

function homeAbsence(userId: number | null, today: string): HomeAbsenceState {
  const self = userId != null ? getUserAbsence(userId) : null;
  const colleagues = listAbsencesOnDay(today).filter(
    (a) => userId == null || a.userId !== userId
  );
  return {
    today,
    self: self
      ? {
          fromYmd: self.fromYmd,
          toYmd: self.toYmd,
          message: self.message,
          isAwayToday: isAbsentOn(self, today),
        }
      : null,
    colleagues: colleagues.map((a) => ({
      userId: a.userId,
      displayName: a.displayName,
      message: a.message,
    })),
  };
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
 * Instant Home payload from local caches (unread, weather, Maringo).
 * Live refresh happens after first paint via /api/home/kpis and /api/home/tickets.
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
  if (userId != null && msConnected) {
    void syncOofPresenceForUser(userId, today).catch((error) => {
      console.warn("[presence] oof home sync:", error);
    });
  }
  const ownerKey =
    userId != null ? `user:${userId}` : ownerKeyFromAuth(auth);
  const cached = readHomeKpiCache(userId);

  const tickets = showMari
    ? getMariTicketsWatchState(ownerKey)
    : null;

  const unreadCount = msConnected ? cached.microsoftUnread : null;
  const googleUnread = googleConnected ? cached.googleUnread : null;
  const weather = cached.weather;
  const teamsEnabled = isUserTeamsEnabled(userId);
  const teamsOpenCount =
    userId != null && msConnected && teamsEnabled
      ? countTeamsThreadsByInbox(userId, "open")
      : null;

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
        lastTeams: null,
        teamsEnabled,
        teamsOpenCount,
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
      ? {
          enabled: true,
          tickets: tickets ?? emptyTickets(),
          savedViews: listMariTicketSavedViews(ownerKey)
            .filter((v) => v.showOnHome)
            .map((v) => ({
              id: v.id,
              label: v.label,
              count: null as number | null,
              href: mariTicketSavedViewHref(v),
            })),
        }
      : null,
    weather,
    ttvDuty: showMari ? homeTtvDuty(userId, today) : null,
    absence: homeAbsence(userId, today),
    pendingStamps: [],
  };
}

export async function refreshHomeKpis(auth: AuthContext): Promise<HomeKpiLive> {
  const userId = resolveAppUserId(auth);
  const modules = auth.modules;
  const showMs = modules.includes("microsoft");
  const showGoogle = modules.includes("google");
  const msConnected = userId != null && showMs && isMicrosoftConnected(userId);
  const googleConnected =
    userId != null && showGoogle && isGoogleMailConnected(userId);
  const cached = readHomeKpiCache(userId);

  const [msLive, googleLive, weatherLive] = await Promise.all([
    userId != null && msConnected && hasMicrosoftMailScope(userId)
      ? withTimeout(getInboxUnreadCount(userId), 8000, null)
      : Promise.resolve(null),
    userId != null && googleConnected
      ? withTimeout(getGmailInboxUnreadCount(userId), 8000, null)
      : Promise.resolve(null),
    withTimeout(fetchHomeWeatherCard(userId), 8000, null),
  ]);

  const microsoftUnread = msLive ?? cached.microsoftUnread;
  const googleUnread = googleLive ?? cached.googleUnread;
  const weather = weatherLive ?? cached.weather;

  if (userId != null) {
    writeHomeUnreadCache(userId, { microsoftUnread, googleUnread });
  }
  if (weatherLive) writeHomeWeatherCache(userId, weatherLive);

  return { microsoftUnread, googleUnread, weather };
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
    const pendingStamps =
      userId != null ? await listHomePendingStamps(userId, zurichYmd()) : [];
    return {
      microsoft: showMs
        ? { events: [], mailInbox: [], tasks: emptyTasks(), lastTeams: null }
        : null,
      google: showGoogle
        ? { events: [], mailInbox: [], tasks: emptyTasks() }
        : null,
      todayEvents: [],
      todayMail: [],
      pendingStamps,
    };
  }

  const [todayEvents, msMail, googleMail, tasks, lastTeams] = await Promise.all([
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
    msConnected &&
    isUserTeamsEnabled(userId) &&
    hasMicrosoftChatScope(userId)
      ? withTimeout(getLatestTeamsChatSnippet(userId), HOME_PROVIDER_TIMEOUT_MS, null)
      : Promise.resolve(null),
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

  const [linkedEvents, pendingStamps] = await Promise.all([
    attachMariToEvents(userId, todayEvents),
    listHomePendingStamps(userId, zurichYmd()),
  ]);

  return {
    microsoft: showMs
      ? {
          events: eventsFromToday(linkedEvents, "microsoft"),
          mailInbox: msMail,
          tasks,
          lastTeams,
        }
      : null,
    google: showGoogle
      ? {
          events: eventsFromToday(linkedEvents, "google"),
          mailInbox: googleMail,
          tasks,
        }
      : null,
    todayEvents: linkedEvents,
    todayMail,
    pendingStamps,
  };
}
