import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

export const ACTIVITY_EVENTS = [
  "login",
  "logout",
  "session_expired",
  "ticket_analysis",
  "mail_day_analysis",
] as const;

export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

export const ACTIVITY_LOG_RETENTION_DAYS = 60;

const EVENT_SET = new Set<string>(ACTIVITY_EVENTS);

export function isActivityEvent(raw: unknown): raw is ActivityEvent {
  return typeof raw === "string" && EVENT_SET.has(raw);
}

export type ActivityDetail = Record<string, unknown> | null | undefined;

export type RecordActivityInput = {
  userId?: number | null;
  username: string;
  event: ActivityEvent;
  detail?: ActivityDetail;
  sessionKey?: string | null;
  /** Optional ISO timestamp; defaults to now. Intended for tests / backfill. */
  createdAt?: string;
};

export type ActivityLogRow = {
  id: number;
  userId: number | null;
  username: string;
  event: ActivityEvent;
  detail: Record<string, unknown> | null;
  sessionKey: string | null;
  createdAt: string;
};

export type ListActivityInput = {
  from?: string | null;
  to?: string | null;
  /** Empty / omitted = all events. `mail_day_analysis` covers both providers. */
  event?: string | null;
  limit?: number;
  offset?: number;
};

export type ListActivityResult = {
  items: ActivityLogRow[];
  total: number;
};

export type OpenActivitySessionInput = {
  sessionKey: string;
  userId?: number | null;
  username: string;
  expiresAt: string | number | Date;
};

type LogRow = {
  id: number;
  user_id: number | null;
  username: string;
  event: string;
  detail_json: string | null;
  session_key: string | null;
  created_at: string;
};

function normalizeUserId(userId: number | null | undefined): number | null {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) {
    return null;
  }
  return userId;
}

function normalizeSessionKey(
  sessionKey: string | null | undefined
): string | null {
  const trimmed = sessionKey?.trim();
  return trimmed ? trimmed : null;
}

function toIso(value: Date | string | number): string {
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : nowIso();
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : nowIso();
  }
  const trimmed = value.trim();
  const d = new Date(trimmed);
  return Number.isFinite(d.getTime()) ? d.toISOString() : trimmed;
}

function normalizeFrom(from?: string | null): string | null {
  const trimmed = from?.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  return trimmed;
}

function normalizeTo(to?: string | null): string | null {
  const trimmed = to?.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T23:59:59.999Z`;
  return trimmed;
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return 100;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

function clampOffset(offset: number | undefined): number {
  if (offset == null || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

function serializeDetail(detail: ActivityDetail): string | null {
  if (detail == null) return null;
  return JSON.stringify(detail);
}

function parseDetail(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  } catch {
    return null;
  }
}

function mapLogRow(row: LogRow): ActivityLogRow {
  const event = isActivityEvent(row.event) ? row.event : "login";
  return {
    id: Number(row.id),
    userId:
      row.user_id == null || row.user_id === undefined
        ? null
        : Number(row.user_id) || null,
    username: String(row.username),
    event,
    detail: parseDetail(row.detail_json),
    sessionKey: row.session_key ? String(row.session_key) : null,
    createdAt: String(row.created_at),
  };
}

function logSafe(label: string, error: unknown): void {
  console.error(
    `[workbuddy] ${label}:`,
    error instanceof Error ? error.message : error
  );
}

/**
 * Fire-and-forget write. Never throws — login / analysis callers stay safe.
 */
export function recordActivity(input: RecordActivityInput): void {
  try {
    const username = input.username?.trim();
    if (!username || !isActivityEvent(input.event)) return;

    const createdAt = input.createdAt?.trim() || nowIso();
    const detailJson = serializeDetail(input.detail);
    const sessionKey = normalizeSessionKey(input.sessionKey);

    getDb()
      .prepare(
        `INSERT OR IGNORE INTO user_activity_log
           (user_id, username, event, detail_json, session_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalizeUserId(input.userId),
        username,
        input.event,
        detailJson,
        sessionKey,
        createdAt
      );
  } catch (error) {
    logSafe("recordActivity failed", error);
  }
}

export function listActivity(
  input: ListActivityInput = {}
): ListActivityResult {
  try {
    const from = normalizeFrom(input.from);
    const to = normalizeTo(input.to);
    const eventRaw = input.event?.trim() ?? "";
    const eventFilter = eventRaw && isActivityEvent(eventRaw) ? eventRaw : null;
    const unknownEvent = Boolean(eventRaw) && !eventFilter;
    if (unknownEvent) {
      return { items: [], total: 0 };
    }

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (from) {
      where.push("created_at >= ?");
      params.push(from);
    }
    if (to) {
      where.push("created_at <= ?");
      params.push(to);
    }
    if (eventFilter) {
      where.push("event = ?");
      params.push(eventFilter);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const db = getDb();

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS n FROM user_activity_log ${whereSql}`)
      .get(...params) as { n: number };
    const rows = db
      .prepare(
        `SELECT id, user_id, username, event, detail_json, session_key, created_at
         FROM user_activity_log
         ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as LogRow[];

    return {
      items: rows.map(mapLogRow),
      total: Number(totalRow?.n ?? 0),
    };
  } catch (error) {
    logSafe("listActivity failed", error);
    return { items: [], total: 0 };
  }
}

/** Deletes log rows older than `days` (default 60). Returns deleted count. */
export function pruneOlderThan(
  days: number = ACTIVITY_LOG_RETENTION_DAYS
): number {
  try {
    const keepDays =
      Number.isFinite(days) && days > 0
        ? Math.floor(days)
        : ACTIVITY_LOG_RETENTION_DAYS;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
    const cutoffIso = cutoff.toISOString();
    const db = getDb();
    const logResult = db
      .prepare(`DELETE FROM user_activity_log WHERE created_at < ?`)
      .run(cutoffIso);
    db.prepare(
      `DELETE FROM user_activity_sessions
       WHERE closed_at IS NOT NULL AND closed_at < ?`
    ).run(cutoffIso);
    return Number(logResult.changes ?? 0);
  } catch (error) {
    logSafe("pruneOlderThan failed", error);
    return 0;
  }
}

export function openActivitySession(input: OpenActivitySessionInput): void {
  try {
    const sessionKey = normalizeSessionKey(input.sessionKey);
    const username = input.username?.trim();
    if (!sessionKey || !username) return;

    getDb()
      .prepare(
        `INSERT INTO user_activity_sessions
           (session_key, user_id, username, expires_at, closed_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(session_key) DO UPDATE SET
           user_id = excluded.user_id,
           username = excluded.username,
           expires_at = excluded.expires_at,
           closed_at = NULL`
      )
      .run(
        sessionKey,
        normalizeUserId(input.userId),
        username,
        toIso(input.expiresAt)
      );
  } catch (error) {
    logSafe("openActivitySession failed", error);
  }
}

export function closeActivitySession(input: { sessionKey: string }): void {
  try {
    const sessionKey = normalizeSessionKey(input.sessionKey);
    if (!sessionKey) return;
    getDb()
      .prepare(
        `UPDATE user_activity_sessions
         SET closed_at = ?
         WHERE session_key = ? AND closed_at IS NULL`
      )
      .run(nowIso(), sessionKey);
  } catch (error) {
    logSafe("closeActivitySession failed", error);
  }
}

/**
 * Close open sessions whose cookie expiry has passed and write
 * `session_expired` once. Already-closed sessions (logout) are skipped.
 */
export function expireOpenSessions(now: Date | string | number = Date.now()): number {
  try {
    const nowIsoStr = toIso(now);
    const db = getDb();
    const open = db
      .prepare(
        `SELECT session_key, user_id, username
         FROM user_activity_sessions
         WHERE closed_at IS NULL AND expires_at < ?`
      )
      .all(nowIsoStr) as Array<{
      session_key: string;
      user_id: number | null;
      username: string;
    }>;

    if (open.length === 0) return 0;

    let expired = 0;
    const tx = db.transaction(() => {
      for (const row of open) {
        recordActivity({
          userId: row.user_id,
          username: row.username,
          event: "session_expired",
          sessionKey: row.session_key,
          detail: { sessionKey: row.session_key },
        });
        closeActivitySession({ sessionKey: row.session_key });
        expired += 1;
      }
    });
    tx();
    return expired;
  } catch (error) {
    logSafe("expireOpenSessions failed", error);
    return 0;
  }
}
