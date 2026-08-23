import type { AuthContext } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import type { AppModule } from "@/lib/users/modules";
import {
  hasMicrosoftCalendarScope,
  hasMicrosoftMailScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { listMicrosoftEventsToday } from "@/lib/microsoft/calendar-review";
import type { MsCalendarEvent } from "@/lib/microsoft/calendar-review";
import { getInboxUnreadCount } from "@/lib/microsoft/mail-inbox";
import { listMicrosoftMailToday } from "@/lib/microsoft/mail-day";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import { getMsMailDayCached } from "@/lib/microsoft/mail-day-analysis-job";
import {
  hasGoogleCalendarScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import { listGoogleEventsToday } from "@/lib/google/calendar-review";
import { listGoogleMailForRange } from "@/lib/google/mail-day";
import { getGoogleMailDayCached } from "@/lib/google/mail-day-analysis-job";
import { zurichYmd } from "@/lib/microsoft/time";
import { loadMariHomeTicketWatch } from "@/lib/mari/sync-tickets-if-due";
import type { MariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import { loadHomeTasksBundle, type HomeTasksBundle } from "./home-tasks";
import { fetchHomeWeatherCard, type HomeWeatherCard } from "@/lib/weather/fetch";
import { loadWorkspaceTodayEvents } from "@/lib/workspace/today-events";
import {
  mergeWorkspaceMailSamples,
  type WorkspaceMailSample,
  type WorkspaceTodayEvent,
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

function mailSample(
  item: MsMailItem,
  provider: "microsoft" | "google"
): HomeMailSample {
  return {
    id: item.id,
    subject: item.subject || "(kein Betreff)",
    from: item.from || (provider === "google" ? "Gmail" : "Outlook"),
    receivedOrSentAt: item.receivedOrSentAt,
    provider,
  };
}

export async function getHomeOverview(
  auth: AuthContext
): Promise<HomeOverviewPayload> {
  const modules = auth.modules;
  const userId = resolveAppUserId(auth);
  const today = zurichYmd();
  const showMs = modules.includes("microsoft");
  const showGoogle = modules.includes("google");
  const showMari = modules.includes("maringo");

  let microsoft: HomeOverviewPayload["microsoft"] = null;
  if (showMs) {
    const connected = userId != null && isMicrosoftConnected(userId);
    let events: MsCalendarEvent[] = [];
    let mailInbox: HomeMailSample[] = [];
    let unreadCount: number | null = null;
    let mailDay: HomeMailDaySummary | null = null;
    if (userId != null && connected && hasMicrosoftCalendarScope(userId)) {
      try {
        events = await listMicrosoftEventsToday(userId);
      } catch {
        events = [];
      }
    }
    if (userId != null && connected && hasMicrosoftMailScope(userId)) {
      const [mailResult, unread] = await Promise.all([
        listMicrosoftMailToday(userId)
          .then((mail) =>
            (mail.inbox || []).slice(0, 4).map((m) => mailSample(m, "microsoft"))
          )
          .catch(() => [] as HomeMailSample[]),
        getInboxUnreadCount(userId),
      ]);
      mailInbox = mailResult;
      unreadCount = unread;
      const cached = getMsMailDayCached(userId, today);
      if (cached) {
        mailDay = {
          dayIso: cached.dayIso,
          inboxCount: cached.inboxCount,
          sentCount: cached.sentCount,
          finishedAt: cached.finishedAt,
          headline: cached.analysis.daySummary?.trim()?.slice(0, 220) || null,
        };
      }
    }
    microsoft = {
      enabled: true,
      connected,
      events,
      mailInbox,
      unreadCount,
      mailDay,
      tasks: {
        microsoftConnected: connected,
        hasMicrosoftScope: false,
        googleConnected: false,
        hasGoogleScope: false,
        items: [],
      },
    };
  }

  let google: HomeOverviewPayload["google"] = null;
  if (showGoogle) {
    const connected = userId != null && isGoogleMailConnected(userId);
    let events: HomeProviderBlock["events"] = [];
    let mailInbox: HomeMailSample[] = [];
    let unreadCount: number | null = null;
    let mailDay: HomeMailDaySummary | null = null;
    if (userId != null && connected && hasGoogleCalendarScope(userId)) {
      try {
        const todayEvents = await listGoogleEventsToday(userId);
        events = todayEvents.map((e) => ({
          id: e.id,
          subject: e.subject,
          startHm: e.startHm,
          endHm: e.endHm,
          location: e.location,
          isAllDay: e.isAllDay,
          done: e.done,
        }));
      } catch {
        events = [];
      }
    }
    if (userId != null && connected) {
      try {
        const mail = await listGoogleMailForRange(userId, today, today);
        mailInbox = (mail.inbox || [])
          .slice(0, 4)
          .map((m) => mailSample(m, "google"));
        unreadCount = (mail.inbox || []).filter((m) => !m.isRead).length;
      } catch {
        mailInbox = [];
      }
      const cached = getGoogleMailDayCached(userId, today);
      if (cached) {
        mailDay = {
          dayIso: cached.dayIso,
          inboxCount: cached.inboxCount,
          sentCount: cached.sentCount,
          finishedAt: cached.finishedAt,
          headline: cached.analysis.daySummary?.trim()?.slice(0, 220) || null,
        };
      }
    }
    google = {
      enabled: true,
      connected,
      events,
      mailInbox,
      unreadCount,
      mailDay,
      tasks: {
        microsoftConnected: false,
        hasMicrosoftScope: false,
        googleConnected: connected,
        hasGoogleScope: false,
        items: [],
      },
    };
  }

  if (showMs || showGoogle) {
    const tasks = await loadHomeTasksBundle(userId);
    if (microsoft) microsoft.tasks = tasks;
    if (google) google.tasks = tasks;
  }

  let maringo: HomeOverviewPayload["maringo"] = null;
  if (showMari) {
    const ownerKey =
      userId != null ? `user:${userId}` : ownerKeyFromAuth(auth);
    maringo = {
      enabled: true,
      tickets:
        userId != null
          ? await loadMariHomeTicketWatch({ userId, ownerKey })
          : {
              configured: false,
              employeeNumber: null,
              lastPollAt: null,
              countsByStatus: [],
              total: 0,
              recentChanges: [],
            },
    };
  }

  const weather = await fetchHomeWeatherCard(userId);

  let todayEvents: WorkspaceTodayEvent[] = [];
  if (userId != null && (showMs || showGoogle)) {
    todayEvents = await loadWorkspaceTodayEvents(userId, {
      wantMicrosoft: showMs,
      wantGoogle: showGoogle,
    });
  }

  const todayMail = mergeWorkspaceMailSamples(
    (microsoft?.mailInbox || []).map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from,
      receivedOrSentAt: m.receivedOrSentAt,
      provider: "microsoft" as const,
    })),
    (google?.mailInbox || []).map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from,
      receivedOrSentAt: m.receivedOrSentAt,
      provider: "google" as const,
    }))
  );

  return {
    greetingName: auth.username,
    today,
    modules,
    microsoft,
    google,
    todayEvents,
    todayMail,
    maringo,
    weather,
  };
}
