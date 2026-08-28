import { getSetting, setSetting } from "@/lib/db/migrations";
import { asTeamsAnalysis } from "@/lib/microsoft/teams-thread-state";
import type { TeamsChatAnalysis } from "@/lib/microsoft/analyze-teams-chat";

export type TeamsDayJobStatus = "running" | "done" | "error";

export type TeamsDayJob = {
  userId: number;
  dayIso: string;
  status: TeamsDayJobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  analysis: TeamsChatAnalysis | null;
  usedAi: boolean;
  threadKeys: string[];
  chatsConsidered: number;
  chatsAnalyzed: number;
  channelsConsidered: number;
  channelsAnalyzed: number;
};

/** Persisted day analysis (7 Zurich days). */
export type TeamsDayCached = {
  dayIso: string;
  finishedAt: string;
  analysis: TeamsChatAnalysis;
  usedAi: boolean;
  threadKeys: string[];
  chatsConsidered: number;
  chatsAnalyzed: number;
  channelsConsidered: number;
  channelsAnalyzed: number;
};

export const TEAMS_DAY_CACHE_MAX = 7;

const STALE_RUNNING_MS = 12 * 60 * 1000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isTeamsDayYmd(value: string | null | undefined): value is string {
  return Boolean(value && YMD_RE.test(value));
}

function jobKey(userId: number): string {
  return `ms_teams_day_analysis_u${userId}`;
}

function cacheKey(userId: number): string {
  return `ms_teams_day_cache_u${userId}`;
}

function asCounts(raw: Record<string, unknown>): Pick<
  TeamsDayCached,
  | "threadKeys"
  | "chatsConsidered"
  | "chatsAnalyzed"
  | "channelsConsidered"
  | "channelsAnalyzed"
> {
  const keys = Array.isArray(raw.threadKeys)
    ? raw.threadKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];
  return {
    threadKeys: keys,
    chatsConsidered: Number(raw.chatsConsidered) || 0,
    chatsAnalyzed: Number(raw.chatsAnalyzed) || 0,
    channelsConsidered: Number(raw.channelsConsidered) || 0,
    channelsAnalyzed: Number(raw.channelsAnalyzed) || 0,
  };
}

function normalizeCached(raw: unknown): TeamsDayCached | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.dayIso !== "string" || !isTeamsDayYmd(e.dayIso)) return null;
  if (typeof e.finishedAt !== "string") return null;
  const analysis = asTeamsAnalysis(e.analysis);
  if (!analysis) return null;
  return {
    dayIso: e.dayIso,
    finishedAt: e.finishedAt,
    analysis,
    usedAi: Boolean(e.usedAi),
    ...asCounts(e),
  };
}

function normalizeJob(raw: unknown, userId: number): TeamsDayJob | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as TeamsDayJob;
  if (parsed.userId !== userId) return null;
  if (!parsed.dayIso || !isTeamsDayYmd(parsed.dayIso)) return null;
  if (
    parsed.status !== "running" &&
    parsed.status !== "done" &&
    parsed.status !== "error"
  ) {
    return null;
  }
  const analysis = parsed.analysis ? asTeamsAnalysis(parsed.analysis) : null;
  const counts = asCounts(parsed as unknown as Record<string, unknown>);
  return {
    userId,
    dayIso: parsed.dayIso,
    status: parsed.status,
    startedAt:
      typeof parsed.startedAt === "string"
        ? parsed.startedAt
        : new Date().toISOString(),
    finishedAt: typeof parsed.finishedAt === "string" ? parsed.finishedAt : null,
    error: typeof parsed.error === "string" ? parsed.error : null,
    analysis,
    usedAi: Boolean(parsed.usedAi),
    ...counts,
  };
}

export function readTeamsDayJob(userId: number): TeamsDayJob | null {
  const raw = getSetting(jobKey(userId));
  if (!raw) return null;
  try {
    return normalizeJob(JSON.parse(raw), userId);
  } catch {
    return null;
  }
}

export function writeTeamsDayJob(job: TeamsDayJob): void {
  setSetting(jobKey(job.userId), JSON.stringify(job));
}

export function clearTeamsDayJob(userId: number): void {
  setSetting(jobKey(userId), null);
}

export function readTeamsDayCache(userId: number): TeamsDayCached[] {
  const raw = getSetting(cacheKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeCached)
      .filter((e): e is TeamsDayCached => Boolean(e));
  } catch {
    return [];
  }
}

export function getTeamsDayCached(
  userId: number,
  dayIso: string
): TeamsDayCached | null {
  if (!isTeamsDayYmd(dayIso)) return null;
  return readTeamsDayCache(userId).find((e) => e.dayIso === dayIso) || null;
}

export function listTeamsDayCachedDays(userId: number): string[] {
  return readTeamsDayCache(userId)
    .slice()
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .map((e) => e.dayIso);
}

export function upsertTeamsDayCache(
  userId: number,
  entry: TeamsDayCached,
  max = TEAMS_DAY_CACHE_MAX
): TeamsDayCached[] {
  const normalized = normalizeCached(entry);
  if (!normalized) return readTeamsDayCache(userId);
  const next = readTeamsDayCache(userId).filter(
    (e) => e.dayIso !== normalized.dayIso
  );
  next.push(normalized);
  next.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const pruned = next.slice(0, Math.max(1, max));
  setSetting(cacheKey(userId), JSON.stringify(pruned));
  return pruned;
}

export function cachedToTeamsDayJob(
  userId: number,
  cached: TeamsDayCached
): TeamsDayJob {
  return {
    userId,
    dayIso: cached.dayIso,
    status: "done",
    startedAt: cached.finishedAt,
    finishedAt: cached.finishedAt,
    error: null,
    analysis: cached.analysis,
    usedAi: cached.usedAi,
    threadKeys: cached.threadKeys,
    chatsConsidered: cached.chatsConsidered,
    chatsAnalyzed: cached.chatsAnalyzed,
    channelsConsidered: cached.channelsConsidered,
    channelsAnalyzed: cached.channelsAnalyzed,
  };
}

export function isTeamsDayJobBusy(
  job: TeamsDayJob | null,
  dayIso?: string
): boolean {
  if (!job || job.status !== "running") return false;
  const started = Date.parse(job.startedAt);
  if (!Number.isFinite(started) || Date.now() - started > STALE_RUNNING_MS) {
    return false;
  }
  if (dayIso && job.dayIso !== dayIso) return true;
  return true;
}

export function startTeamsDayJob(
  userId: number,
  dayIso: string
): TeamsDayJob {
  const job: TeamsDayJob = {
    userId,
    dayIso,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    analysis: null,
    usedAi: false,
    threadKeys: [],
    chatsConsidered: 0,
    chatsAnalyzed: 0,
    channelsConsidered: 0,
    channelsAnalyzed: 0,
  };
  writeTeamsDayJob(job);
  return job;
}

export type TeamsDayJobCounts = Pick<
  TeamsDayJob,
  | "threadKeys"
  | "chatsConsidered"
  | "chatsAnalyzed"
  | "channelsConsidered"
  | "channelsAnalyzed"
>;

export function finishTeamsDayJobOk(
  userId: number,
  dayIso: string,
  analysis: TeamsChatAnalysis,
  usedAi: boolean,
  counts: TeamsDayJobCounts
): TeamsDayJob {
  const finishedAt = new Date().toISOString();
  const job: TeamsDayJob = {
    userId,
    dayIso,
    status: "done",
    startedAt: readTeamsDayJob(userId)?.startedAt || finishedAt,
    finishedAt,
    error: null,
    analysis,
    usedAi,
    ...counts,
  };
  writeTeamsDayJob(job);
  upsertTeamsDayCache(userId, {
    dayIso,
    finishedAt,
    analysis,
    usedAi,
    ...counts,
  });
  return job;
}

export function finishTeamsDayJobError(
  userId: number,
  dayIso: string,
  error: string
): TeamsDayJob {
  const prev = readTeamsDayJob(userId);
  const job: TeamsDayJob = {
    userId,
    dayIso,
    status: "error",
    startedAt: prev?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error,
    analysis: null,
    usedAi: false,
    threadKeys: prev?.threadKeys || [],
    chatsConsidered: prev?.chatsConsidered || 0,
    chatsAnalyzed: prev?.chatsAnalyzed || 0,
    channelsConsidered: prev?.channelsConsidered || 0,
    channelsAnalyzed: prev?.channelsAnalyzed || 0,
  };
  writeTeamsDayJob(job);
  return job;
}
