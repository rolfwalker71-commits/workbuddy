import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireModule,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { hasChatKey } from "@/lib/ai/client";
import { runWithAiUser } from "@/lib/ai/request-context";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  analyzeTeamsThreads,
  emptyTeamsAnalysis,
  type TeamsThreadForAnalysis,
} from "@/lib/microsoft/analyze-teams-chat";
import {
  cachedToTeamsDayJob,
  finishTeamsDayJobError,
  finishTeamsDayJobOk,
  getTeamsDayCached,
  isTeamsDayJobBusy,
  isTeamsDayYmd,
  listTeamsDayCachedDays,
  readTeamsDayJob,
  startTeamsDayJob,
  upsertTeamsDayCache,
  type TeamsDayJob,
} from "@/lib/microsoft/teams-day-analysis-job";
import { collectTeamsDayThreads } from "@/lib/microsoft/teams-day-scope";
import {
  getTeamChannelTitle,
  listChannelMessages,
} from "@/lib/microsoft/teams-channels";
import { listTeamsChatMessages, listTeamsChats } from "@/lib/microsoft/teams-chats";
import { stampTeamsDayThreads } from "@/lib/microsoft/teams-thread-state";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  hasMicrosoftChannelListScopes,
  hasMicrosoftChannelMessageScope,
  hasMicrosoftChatMessageScope,
  hasMicrosoftChatScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  isUserTeamsEnabled,
  teamsPreferenceOffResponse,
} from "@/lib/microsoft/teams-prefs";
import { notifyAppChange } from "@/lib/realtime/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const BodySchema = z.object({
  scope: z.enum(["thread", "day"]).optional().default("thread"),
  chatId: z.string().trim().min(1).max(400).optional(),
  teamId: z.string().trim().min(1).max(400).optional(),
  channelId: z.string().trim().min(1).max(400).optional(),
});

function jobPayload(job: TeamsDayJob | null) {
  if (!job) return null;
  return {
    userId: job.userId,
    dayIso: job.dayIso,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    analysis: job.analysis,
    usedAi: job.usedAi,
    threadKeys: job.threadKeys,
    chatsConsidered: job.chatsConsidered,
    chatsAnalyzed: job.chatsAnalyzed,
    channelsConsidered: job.channelsConsidered,
    channelsAnalyzed: job.channelsAnalyzed,
  };
}

function analyzeGetBody(
  job: TeamsDayJob | null,
  extra: {
    status: "idle" | "running" | "done" | "error";
    today: string;
    day: string;
    cachedDays: string[];
    fromCache: boolean;
    stale?: boolean;
  }
) {
  return {
    ok: true,
    status: extra.status,
    job: jobPayload(job),
    cachedDays: extra.cachedDays,
    cached: job
      ? {
          dayIso: job.dayIso,
          finishedAt: job.finishedAt,
          analysis: job.analysis,
          usedAi: job.usedAi,
          threadKeys: job.threadKeys,
          chatsConsidered: job.chatsConsidered,
          chatsAnalyzed: job.chatsAnalyzed,
          channelsConsidered: job.channelsConsidered,
          channelsAnalyzed: job.channelsAnalyzed,
        }
      : null,
    fromCache: extra.fromCache,
    stale: extra.stale,
    today: extra.today,
    day: extra.day,
    scope: "day" as const,
    analysis: job?.analysis ?? null,
    usedAi: job?.usedAi ?? false,
    threadKeys: job?.threadKeys ?? [],
    chatsConsidered: job?.chatsConsidered ?? 0,
    chatsAnalyzed: job?.chatsAnalyzed ?? 0,
    channelsConsidered: job?.channelsConsidered ?? 0,
    channelsAnalyzed: job?.channelsAnalyzed ?? 0,
  };
}

function notifyDayDone(job: TeamsDayJob, skipTelegram: boolean) {
  const detail = [
    `${job.chatsAnalyzed} Chat(s)`,
    `${job.channelsAnalyzed} Kanal/Kanäle`,
    job.analysis
      ? `${job.analysis.tasks.length} Aufgabe(n)`
      : null,
    job.dayIso,
  ]
    .filter(Boolean)
    .join(" · ");
  notifyAppChange({
    domain: "microsoft",
    reason: "microsoft_teams_day",
    headline: "Teams-Tagesanalyse fertig",
    detail,
    title: null,
    href: "/microsoft?tab=teams",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "microsoft",
    skipTelegram,
    skipWebPush: skipTelegram,
  });
}

function notifyDayError(dayIso: string, message: string, skipTelegram: boolean) {
  notifyAppChange({
    domain: "microsoft",
    reason: "microsoft_teams_day",
    headline: "Teams-Tagesanalyse fehlgeschlagen",
    detail: `${dayIso}: ${message.slice(0, 180)}`,
    title: null,
    href: "/microsoft?tab=teams",
    aiIconUrl: null,
    category: null,
    meta: null,
    source: "microsoft",
    skipTelegram,
    skipWebPush: skipTelegram,
  });
}

async function runDayAnalysisJob(
  userId: number,
  dayIso: string,
  skipTelegram: boolean
) {
  try {
    const includeChannels =
      hasMicrosoftChannelListScopes(userId) &&
      hasMicrosoftChannelMessageScope(userId);
    const collected = await collectTeamsDayThreads(userId, dayIso, {
      includeChannels,
    });
    const counts = {
      threadKeys: collected.threads.map((t) => t.id),
      chatsConsidered: collected.chatsConsidered,
      chatsAnalyzed: collected.chatsAnalyzed,
      channelsConsidered: collected.channelsConsidered,
      channelsAnalyzed: collected.channelsAnalyzed,
    };
    if (collected.threads.length === 0) {
      const analysis = emptyTeamsAnalysis(
        "Heute keine Chat- oder Kanal-Aktivität in der geladenen Liste."
      );
      const job = finishTeamsDayJobOk(userId, dayIso, analysis, false, counts);
      notifyDayDone(job, skipTelegram);
      return;
    }
    const analysis = await analyzeTeamsThreads(collected.threads, {
      todayIso: dayIso,
      label: `Teams heute (${dayIso})`,
    });
    stampTeamsDayThreads(userId, collected.threads, analysis);
    const job = finishTeamsDayJobOk(userId, dayIso, analysis, true, counts);
    notifyDayDone(job, skipTelegram);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishTeamsDayJobError(userId, dayIso, message);
    notifyDayError(dayIso, message, skipTelegram);
  }
}

/** Job + Cache (letzte 7 Zurich-Tage). `?day=YYYY-MM-DD` wählt einen Tag. */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  return runWithRequestSecrets(auth, async () => {
    const userId = resolveMicrosoftUserId(auth);
    if (!isUserTeamsEnabled(userId)) return teamsPreferenceOffResponse();
    if (userId == null || !isMicrosoftConnected(userId)) {
      return NextResponse.json(
        { error: "Microsoft 365 nicht verbunden." },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const today = zurichYmd();
    const dayParam = url.searchParams.get("day")?.trim() || "";
    const day = isTeamsDayYmd(dayParam) ? dayParam : today;
    const cachedDays = listTeamsDayCachedDays(userId);
    const job = readTeamsDayJob(userId);

    if (job?.status === "running" && isTeamsDayJobBusy(job)) {
      return NextResponse.json(
        analyzeGetBody(job, {
          status: "running",
          today,
          day,
          cachedDays,
          fromCache: false,
        })
      );
    }

    if (job?.status === "running" && !isTeamsDayJobBusy(job)) {
      const cached = getTeamsDayCached(userId, day);
      if (cached) {
        return NextResponse.json(
          analyzeGetBody(cachedToTeamsDayJob(userId, cached), {
            status: "done",
            today,
            day,
            cachedDays,
            fromCache: true,
            stale: true,
          })
        );
      }
      return NextResponse.json(
        analyzeGetBody(
          {
            ...job,
            status: "error",
            error: job.error || "Analyse abgebrochen oder Timeout.",
            finishedAt: new Date().toISOString(),
          },
          {
            status: "error",
            today,
            day,
            cachedDays,
            fromCache: false,
            stale: true,
          }
        )
      );
    }

    if (job?.status === "error" && job.dayIso === day) {
      return NextResponse.json(
        analyzeGetBody(job, {
          status: "error",
          today,
          day,
          cachedDays,
          fromCache: false,
        })
      );
    }

    if (job?.status === "done" && job.analysis && job.dayIso === day) {
      if (job.finishedAt) {
        upsertTeamsDayCache(userId, {
          dayIso: job.dayIso,
          finishedAt: job.finishedAt,
          analysis: job.analysis,
          usedAi: job.usedAi,
          threadKeys: job.threadKeys,
          chatsConsidered: job.chatsConsidered,
          chatsAnalyzed: job.chatsAnalyzed,
          channelsConsidered: job.channelsConsidered,
          channelsAnalyzed: job.channelsAnalyzed,
        });
      }
      return NextResponse.json(
        analyzeGetBody(job, {
          status: "done",
          today,
          day,
          cachedDays: listTeamsDayCachedDays(userId),
          fromCache: false,
        })
      );
    }

    const cached = getTeamsDayCached(userId, day);
    if (cached) {
      return NextResponse.json(
        analyzeGetBody(cachedToTeamsDayJob(userId, cached), {
          status: "done",
          today,
          day,
          cachedDays,
          fromCache: true,
        })
      );
    }

    if (job?.status === "done" && job.analysis && day === today) {
      return NextResponse.json(
        analyzeGetBody(job, {
          status: "done",
          today,
          day,
          cachedDays,
          fromCache: false,
        })
      );
    }

    return NextResponse.json(
      analyzeGetBody(null, {
        status: "idle",
        today,
        day,
        cachedDays,
        fromCache: false,
      })
    );
  });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  return runWithRequestSecrets(auth, async () => {
    const userId = resolveMicrosoftUserId(auth);
    if (!isUserTeamsEnabled(userId)) return teamsPreferenceOffResponse();
    if (userId == null || !isMicrosoftConnected(userId)) {
      return NextResponse.json(
        { error: "Microsoft 365 nicht verbunden." },
        { status: 400 }
      );
    }
    if (!hasChatKey()) {
      return NextResponse.json(
        { error: "Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API)." },
        { status: 400 }
      );
    }

    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Ungültige Anfrage",
        },
        { status: 400 }
      );
    }

    const todayIso = zurichYmd();

    try {
      if (body.scope === "day") {
        if (!hasMicrosoftChatScope(userId) || !hasMicrosoftChatMessageScope(userId)) {
          return NextResponse.json(
            {
              error:
                "Chat-Recht fehlt. Unter Konto Microsoft 365 neu verbinden (Chat.Read + ChatMessage.Read).",
              needsReconnect: true,
            },
            { status: 403 }
          );
        }
        const existing = readTeamsDayJob(userId);
        if (isTeamsDayJobBusy(existing, todayIso)) {
          return NextResponse.json(
            {
              ok: true,
              accepted: false,
              status: "running",
              job: jobPayload(existing),
              scope: "day",
              today: todayIso,
              cachedDays: listTeamsDayCachedDays(userId),
              message: "Tagesanalyse läuft bereits.",
            },
            { status: 202 }
          );
        }
        const job = startTeamsDayJob(userId, todayIso);
        const skipTelegram = !auth.isAdmin;
        after(() =>
          runWithAiUser(userId, () =>
            runDayAnalysisJob(userId, todayIso, skipTelegram)
          )
        );
        return NextResponse.json(
          {
            ok: true,
            accepted: true,
            status: "running",
            job: jobPayload(job),
            scope: "day",
            today: todayIso,
            cachedDays: listTeamsDayCachedDays(userId),
            message: `Tagesanalyse für ${todayIso} gestartet.`,
          },
          { status: 202 }
        );
      }

      if (body.teamId || body.channelId) {
        if (!body.teamId || !body.channelId) {
          return NextResponse.json(
            { error: "teamId und channelId gehören zusammen." },
            { status: 400 }
          );
        }
        if (!hasMicrosoftChannelMessageScope(userId)) {
          return NextResponse.json(
            {
              error:
                "Kanal-Recht fehlt. Unter Konto Microsoft 365 neu verbinden.",
              needsReconnect: true,
            },
            { status: 403 }
          );
        }
        const title = await getTeamChannelTitle(
          userId,
          body.teamId,
          body.channelId
        );
        const messages = await listChannelMessages(
          userId,
          body.teamId,
          body.channelId
        );
        const thread: TeamsThreadForAnalysis = {
          id: `${body.teamId}:${body.channelId}`,
          title,
          kind: "channel",
          messages,
        };
        const analysis = await analyzeTeamsThreads([thread], {
          todayIso,
          label: title,
        });
        return NextResponse.json({
          ok: true,
          usedAi: true,
          scope: "thread",
          source: "channel",
          analysis,
        });
      }

      if (!body.chatId) {
        return NextResponse.json(
          { error: "chatId oder scope=day nötig." },
          { status: 400 }
        );
      }
      if (!hasMicrosoftChatMessageScope(userId)) {
        return NextResponse.json(
          {
            error:
              "Chat-Recht fehlt. Unter Konto Microsoft 365 neu verbinden.",
            needsReconnect: true,
          },
          { status: 403 }
        );
      }
      const chats = await listTeamsChats(userId, { top: 40 });
      const chat = chats.find((c) => c.id === body.chatId);
      const messages = await listTeamsChatMessages(userId, body.chatId);
      const analysis = await analyzeTeamsThreads(
        [
          {
            id: body.chatId,
            title: chat?.title || "Teams-Chat",
            kind: "chat",
            messages,
          },
        ],
        { todayIso, label: chat?.title || "Teams-Chat" }
      );
      return NextResponse.json({
        ok: true,
        usedAi: true,
        scope: "thread",
        source: "chat",
        analysis,
      });
    } catch (error) {
      console.warn(
        `[teams] analyze failed user=${userId} ${error instanceof Error ? error.message : "error"}`
      );
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Teams-Analyse fehlgeschlagen.",
        },
        { status: 502 }
      );
    }
  });
}
