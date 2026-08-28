import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  TeamsAnalysisEventSchema,
  TeamsAnalysisReplySchema,
  TeamsAnalysisTaskSchema,
  TeamsChatAnalysisSchema,
  type TeamsChatAnalysis,
} from "@/lib/microsoft/analyze-teams-chat";

export const TEAMS_THREAD_KINDS = ["chat", "channel"] as const;
export const TEAMS_INBOX_STATES = ["open", "later", "done", "ignored"] as const;

export type TeamsThreadKind = (typeof TEAMS_THREAD_KINDS)[number];
export type TeamsInboxState = (typeof TEAMS_INBOX_STATES)[number];

/** Persisted Teams inbox row. Search, Home, and transcript read title/preview/join fields. */
export type TeamsThreadState = {
  userId: number;
  threadKey: string;
  kind: TeamsThreadKind;
  inbox: TeamsInboxState;
  title: string | null;
  preview: string | null;
  lastActiveAt: string | null;
  /** Meeting+transcript later — already on TeamsChatListItem. */
  joinUrl: string | null;
  calendarEventId: string | null;
  issueId: number | null;
  appliedTasks: number;
  appliedEvents: number;
  lastAnalysis: TeamsChatAnalysis | null;
  updatedAt: string;
};

type Row = {
  user_id: number;
  thread_key: string;
  kind: string;
  inbox: string;
  title: string | null;
  preview: string | null;
  last_active_at: string | null;
  join_url: string | null;
  calendar_event_id: string | null;
  issue_id: number | null;
  applied_tasks: number;
  applied_events: number;
  last_analysis_json: string | null;
  updated_at: string;
};

export function parseTeamsThreadKind(raw: unknown): TeamsThreadKind | null {
  if (raw === "chat" || raw === "channel") return raw;
  return null;
}

export function parseTeamsInboxState(raw: unknown): TeamsInboxState | null {
  if (
    raw === "open" ||
    raw === "later" ||
    raw === "done" ||
    raw === "ignored"
  ) {
    return raw;
  }
  return null;
}

export function channelThreadKey(teamId: string, channelId: string): string {
  return `${teamId.trim()}:${channelId.trim()}`;
}

/** Inverse of channelThreadKey. Chat ids start with `19:` and must not parse as a channel. */
export function parseChannelThreadKey(
  raw: string | null | undefined
): { teamId: string; channelId: string } | null {
  const key = raw?.trim() || "";
  const idx = key.indexOf(":");
  if (idx < 1) return null;
  const teamId = key.slice(0, idx).trim();
  const channelId = key.slice(idx + 1).trim();
  if (!teamId || !channelId) return null;
  if (teamId === "19") return null;
  return { teamId, channelId };
}

export function parseStoredTeamsAnalysis(
  raw: string | null | undefined
): TeamsChatAnalysis | null {
  if (!raw?.trim()) return null;
  try {
    return asTeamsAnalysis(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function asTeamsAnalysis(raw: unknown): TeamsChatAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.summary !== "string") return null;
  const parsed = TeamsChatAnalysisSchema.safeParse(raw);
  if (!parsed.success) return null;
  const tasks = TeamsAnalysisTaskSchema.array().safeParse(obj.tasks);
  const events = TeamsAnalysisEventSchema.array().safeParse(obj.events);
  const replies = TeamsAnalysisReplySchema.array().safeParse(obj.replies);
  return {
    summary: parsed.data.summary,
    clusters: parsed.data.clusters,
    tasks: tasks.success
      ? tasks.data
      : parsed.data.clusters.flatMap((c) => c.tasks),
    events: events.success
      ? events.data
      : parsed.data.clusters.flatMap((c) => c.events),
    replies: replies.success
      ? replies.data
      : parsed.data.clusters.flatMap((c) => c.replies),
  };
}

function mapRow(row: Row): TeamsThreadState | null {
  const kind = parseTeamsThreadKind(row.kind);
  const inbox = parseTeamsInboxState(row.inbox);
  if (!kind || !inbox) return null;
  return {
    userId: Number(row.user_id),
    threadKey: row.thread_key,
    kind,
    inbox,
    title: row.title,
    preview: row.preview,
    lastActiveAt: row.last_active_at,
    joinUrl: row.join_url,
    calendarEventId: row.calendar_event_id,
    issueId: row.issue_id == null ? null : Number(row.issue_id),
    appliedTasks: Number(row.applied_tasks) || 0,
    appliedEvents: Number(row.applied_events) || 0,
    lastAnalysis: parseStoredTeamsAnalysis(row.last_analysis_json),
    updatedAt: row.updated_at,
  };
}

export function getTeamsThreadState(
  userId: number,
  threadKey: string
): TeamsThreadState | null {
  const key = threadKey.trim();
  if (!key) return null;
  const row = getDb()
    .prepare(
      `SELECT * FROM teams_thread_state
       WHERE user_id = ? AND thread_key = ?`
    )
    .get(userId, key) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function listTeamsThreadStates(
  userId: number,
  options?: {
    inbox?: TeamsInboxState | TeamsInboxState[];
    q?: string;
    limit?: number;
  }
): TeamsThreadState[] {
  const inboxFilter = Array.isArray(options?.inbox)
    ? options.inbox
    : options?.inbox
      ? [options.inbox]
      : [];
  const q = options?.q?.trim();
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  const clauses = ["user_id = ?"];
  const params: Array<string | number> = [userId];
  if (inboxFilter.length > 0) {
    clauses.push(`inbox IN (${inboxFilter.map(() => "?").join(", ")})`);
    params.push(...inboxFilter);
  }
  if (q) {
    const like = `%${q}%`;
    clauses.push(
      `(COALESCE(title, '') LIKE ? OR COALESCE(preview, '') LIKE ? OR thread_key LIKE ?)`
    );
    params.push(like, like, like);
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM teams_thread_state
       WHERE ${clauses.join(" AND ")}
       ORDER BY COALESCE(last_active_at, '') DESC, updated_at DESC
       LIMIT ?`
    )
    .all(...params, limit) as Row[];
  return rows.map(mapRow).filter((r): r is TeamsThreadState => r != null);
}

/** Home tile: count of open inbox threads. */
export function countTeamsThreadsByInbox(
  userId: number,
  inbox: TeamsInboxState
): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM teams_thread_state
       WHERE user_id = ? AND inbox = ?`
    )
    .get(userId, inbox) as { c: number } | undefined;
  return row?.c ?? 0;
}

/** Home tile subtitle: most recently active open thread. */
export function getLatestOpenTeamsThread(
  userId: number
): Pick<TeamsThreadState, "threadKey" | "title" | "lastActiveAt"> | null {
  const rows = listTeamsThreadStates(userId, { inbox: "open", limit: 8 });
  const hit = rows.find((r) => r.title?.trim()) ?? rows[0] ?? null;
  if (!hit) return null;
  return {
    threadKey: hit.threadKey,
    title: hit.title,
    lastActiveAt: hit.lastActiveAt,
  };
}

export type TeamsThreadStatePatch = {
  userId: number;
  threadKey: string;
  kind?: TeamsThreadKind;
  inbox?: TeamsInboxState;
  title?: string | null;
  preview?: string | null;
  lastActiveAt?: string | null;
  joinUrl?: string | null;
  calendarEventId?: string | null;
  issueId?: number | null;
  appliedTasks?: number;
  appliedEvents?: number;
  lastAnalysis?: TeamsChatAnalysis | null;
};

export function upsertTeamsThreadState(
  input: TeamsThreadStatePatch
): TeamsThreadState {
  const threadKey = input.threadKey.trim();
  if (!threadKey) throw new Error("threadKey fehlt");
  const existing = getTeamsThreadState(input.userId, threadKey);
  const now = nowIso();
  const next: TeamsThreadState = {
    userId: input.userId,
    threadKey,
    kind: input.kind ?? existing?.kind ?? "chat",
    inbox: input.inbox ?? existing?.inbox ?? "open",
    title: input.title !== undefined ? input.title : (existing?.title ?? null),
    preview:
      input.preview !== undefined ? input.preview : (existing?.preview ?? null),
    lastActiveAt:
      input.lastActiveAt !== undefined
        ? input.lastActiveAt
        : (existing?.lastActiveAt ?? null),
    joinUrl:
      input.joinUrl !== undefined ? input.joinUrl : (existing?.joinUrl ?? null),
    calendarEventId:
      input.calendarEventId !== undefined
        ? input.calendarEventId
        : (existing?.calendarEventId ?? null),
    issueId:
      input.issueId !== undefined ? input.issueId : (existing?.issueId ?? null),
    appliedTasks:
      input.appliedTasks !== undefined
        ? Math.max(0, input.appliedTasks)
        : (existing?.appliedTasks ?? 0),
    appliedEvents:
      input.appliedEvents !== undefined
        ? Math.max(0, input.appliedEvents)
        : (existing?.appliedEvents ?? 0),
    lastAnalysis:
      input.lastAnalysis !== undefined
        ? input.lastAnalysis
        : (existing?.lastAnalysis ?? null),
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO teams_thread_state (
         user_id, thread_key, kind, inbox, title, preview, last_active_at,
         join_url, calendar_event_id, issue_id, applied_tasks, applied_events,
         last_analysis_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, thread_key) DO UPDATE SET
         kind = excluded.kind,
         inbox = excluded.inbox,
         title = excluded.title,
         preview = excluded.preview,
         last_active_at = excluded.last_active_at,
         join_url = excluded.join_url,
         calendar_event_id = excluded.calendar_event_id,
         issue_id = excluded.issue_id,
         applied_tasks = excluded.applied_tasks,
         applied_events = excluded.applied_events,
         last_analysis_json = excluded.last_analysis_json,
         updated_at = excluded.updated_at`
    )
    .run(
      next.userId,
      next.threadKey,
      next.kind,
      next.inbox,
      next.title,
      next.preview,
      next.lastActiveAt,
      next.joinUrl,
      next.calendarEventId,
      next.issueId,
      next.appliedTasks,
      next.appliedEvents,
      next.lastAnalysis ? JSON.stringify(next.lastAnalysis) : null,
      next.updatedAt
    );

  return getTeamsThreadState(input.userId, threadKey)!;
}

export function analysisForThread(
  analysis: TeamsChatAnalysis,
  threadKey: string
): TeamsChatAnalysis {
  const key = threadKey.trim();
  const cluster = analysis.clusters.find((c) => c.sourceChatId === key);
  if (cluster) {
    return {
      summary: cluster.summary || analysis.summary,
      clusters: [cluster],
      tasks: cluster.tasks,
      events: cluster.events,
      replies: cluster.replies,
    };
  }
  return {
    summary: analysis.summary,
    clusters: [],
    tasks: analysis.tasks.filter((t) => t.sourceChatId === key),
    events: analysis.events.filter((e) => e.sourceChatId === key),
    replies: analysis.replies.filter((r) => r.sourceChatId === key),
  };
}

/** After day analyze: stamp title/preview/analysis. Leaves inbox untouched. */
export function stampTeamsDayThreads(
  userId: number,
  threads: Array<{
    id: string;
    title: string;
    kind?: "chat" | "channel";
    lastActiveAt?: string | null;
    preview?: string | null;
    joinUrl?: string | null;
    calendarEventId?: string | null;
  }>,
  analysis: TeamsChatAnalysis
): void {
  for (const thread of threads) {
    const key = thread.id.trim();
    if (!key) continue;
    upsertTeamsThreadState({
      userId,
      threadKey: key,
      kind: thread.kind,
      title: thread.title,
      preview: thread.preview ?? null,
      lastActiveAt: thread.lastActiveAt ?? null,
      joinUrl: thread.joinUrl,
      calendarEventId: thread.calendarEventId,
      lastAnalysis: analysisForThread(analysis, key),
    });
  }
}

export function incrementTeamsThreadApplied(
  userId: number,
  threadKey: string,
  delta: { tasks?: number; events?: number }
): TeamsThreadState | null {
  const row = getTeamsThreadState(userId, threadKey);
  if (!row) return null;
  return upsertTeamsThreadState({
    userId,
    threadKey,
    appliedTasks: row.appliedTasks + Math.max(0, delta.tasks ?? 0),
    appliedEvents: row.appliedEvents + Math.max(0, delta.events ?? 0),
  });
}
