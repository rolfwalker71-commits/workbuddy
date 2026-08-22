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
import { listMicrosoftMailToday } from "@/lib/microsoft/mail-day";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import { getMsMailDayCached } from "@/lib/microsoft/mail-day-analysis-job";
import { zurichYmd } from "@/lib/microsoft/time";
import { getMariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import type { MariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import { loadHomeTasksBundle, type HomeTasksBundle } from "./home-tasks";
import { fetchHomeWeatherCard, type HomeWeatherCard } from "@/lib/weather/fetch";

export type HomeMailSample = {
  id: string;
  subject: string;
  from: string;
  receivedOrSentAt: string | null;
};

export type HomeMailDaySummary = {
  dayIso: string;
  inboxCount: number;
  sentCount: number;
  finishedAt: string;
  headline: string | null;
};

export type HomeOverviewPayload = {
  greetingName: string | null;
  today: string;
  modules: AppModule[];
  microsoft: {
    enabled: boolean;
    connected: boolean;
    events: MsCalendarEvent[];
    mailInbox: HomeMailSample[];
    mailDay: HomeMailDaySummary | null;
    tasks: HomeTasksBundle;
  } | null;
  maringo: {
    enabled: boolean;
    tickets: MariTicketsWatchState;
  } | null;
  weather: HomeWeatherCard | null;
};

function mailSample(item: MsMailItem): HomeMailSample {
  return {
    id: item.id,
    subject: item.subject || "(kein Betreff)",
    from: item.from || "Outlook",
    receivedOrSentAt: item.receivedOrSentAt,
  };
}

export async function getHomeOverview(
  auth: AuthContext
): Promise<HomeOverviewPayload> {
  const modules = auth.modules;
  const userId = resolveAppUserId(auth);
  const today = zurichYmd();
  const showMs = modules.includes("microsoft");
  const showMari = modules.includes("maringo");

  let microsoft: HomeOverviewPayload["microsoft"] = null;
  if (showMs) {
    const connected = userId != null && isMicrosoftConnected(userId);
    let events: MsCalendarEvent[] = [];
    let mailInbox: HomeMailSample[] = [];
    let mailDay: HomeMailDaySummary | null = null;
    if (userId != null && connected && hasMicrosoftCalendarScope(userId)) {
      try {
        events = await listMicrosoftEventsToday(userId);
      } catch {
        events = [];
      }
    }
    if (userId != null && connected && hasMicrosoftMailScope(userId)) {
      try {
        const mail = await listMicrosoftMailToday(userId);
        mailInbox = (mail.inbox || []).slice(0, 4).map(mailSample);
      } catch {
        mailInbox = [];
      }
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
    const tasks = await loadHomeTasksBundle(userId);
    microsoft = { enabled: true, connected, events, mailInbox, mailDay, tasks };
  }

  let maringo: HomeOverviewPayload["maringo"] = null;
  if (showMari) {
    maringo = {
      enabled: true,
      tickets: getMariTicketsWatchState(ownerKeyFromAuth(auth)),
    };
  }

  const weather = await fetchHomeWeatherCard(userId);

  return {
    greetingName: auth.username,
    today,
    modules,
    microsoft,
    maringo,
    weather,
  };
}
