/**
 * Stamp Outlook events created from Maringo tickets so evening processing
 * can suggest time bookings — owner-scoped per WorkBuddy user.
 */
import { getDb } from "@/lib/db/client";
import { hoursBetweenHm } from "@/lib/mari/event-title-tokens";

export { hoursBetweenHm } from "@/lib/mari/event-title-tokens";

/** Hours-only stamp (no MARI ticket). Never listed as evening suggestion. */
export const HOURS_ONLY_STAMP_ISSUE_ID = 0;

/** Outlook category for any Maringo-origin event. */
export const BUDDY_MARI_CATEGORY = "WorkBuddy/Maringo";

/** Body/description marker (Outlook fallback). */
export const BUDDY_MARI_BODY_MARKER_RE = /\[\[(?:buddy|workbuddy):mari:(\d+)\]\]/i;

export function buddyMariIssueCategory(issueId: number): string {
  return `WorkBuddy/Mari#${issueId}`;
}

export function parseMariIssueIdFromCategories(
  categories: string[] | null | undefined
): number | null {
  for (const c of categories || []) {
    const m = /^(?:Buddy|WorkBuddy)\/Mari#(\d+)$/i.exec(c.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

export function parseMariIssueIdFromBody(
  body: string | null | undefined
): number | null {
  const m = BUDDY_MARI_BODY_MARKER_RE.exec(body || "");
  return m ? Number(m[1]) : null;
}

export function appendMariBodyMarker(
  notes: string | null | undefined,
  issueId: number
): string {
  const base = (notes || "").trim();
  const marker = `[[workbuddy:mari:${issueId}]]`;
  if (base.includes(marker) || /\[\[buddy:mari:\d+\]\]/i.test(base)) return base;
  return base ? `${base}\n\n${marker}` : marker;
}

export function mariOutlookCategories(issueId: number): string[] {
  return [BUDDY_MARI_CATEGORY, buddyMariIssueCategory(issueId)];
}

export type MariCalendarStampStatus = "pending" | "booked" | "dismissed";

export type MariCalendarStamp = {
  userId: number;
  ownerKey: string;
  eventProvider: "microsoft";
  eventId: string;
  calendarId: string | null;
  issueId: number;
  eventDate: string;
  startHm: string | null;
  endHm: string | null;
  title: string;
  memo: string | null;
  hours: number | null;
  status: MariCalendarStampStatus;
  bookedLineId: number | null;
  createdAt: string;
  updatedAt: string;
};

function ownerKeyForUser(userId: number): string {
  return userId > 0 ? `user:${userId}` : "admin";
}

export function ensureMariCalendarStampsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mari_calendar_stamps (
      user_id INTEGER NOT NULL,
      owner_key TEXT NOT NULL,
      event_provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      calendar_id TEXT,
      issue_id INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      start_hm TEXT,
      end_hm TEXT,
      title TEXT NOT NULL,
      memo TEXT,
      hours REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      booked_line_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, event_provider, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_owner_pending
      ON mari_calendar_stamps(user_id, status, event_date);
    CREATE INDEX IF NOT EXISTS idx_mari_calendar_stamps_owner_issue
      ON mari_calendar_stamps(user_id, issue_id, event_date);
  `);
}

function requireUserId(userId: number | null | undefined): number {
  if (userId == null || !Number.isInteger(userId) || userId <= 0) {
    throw new Error("Kalender-Stamps brauchen einen App-User.");
  }
  return userId;
}

export function upsertMariCalendarStamp(input: {
  userId: number;
  eventProvider?: "microsoft";
  eventId: string;
  calendarId?: string | null;
  issueId: number;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  memo?: string | null;
  hours?: number | null;
}): MariCalendarStamp {
  const userId = requireUserId(input.userId);
  ensureMariCalendarStampsTable();
  const db = getDb();
  const now = new Date().toISOString();
  const hours =
    input.hours ??
    (input.startHm && input.endHm
      ? hoursBetweenHm(input.startHm, input.endHm)
      : null);
  const ownerKey = ownerKeyForUser(userId);
  db.prepare(
    `INSERT INTO mari_calendar_stamps (
      user_id, owner_key, event_provider, event_id, calendar_id, issue_id, event_date,
      start_hm, end_hm, title, memo, hours, status, booked_line_id,
      created_at, updated_at
    ) VALUES (
      @userId, @ownerKey, 'microsoft', @eventId, @calendarId, @issueId, @eventDate,
      @startHm, @endHm, @title, @memo, @hours, 'pending', NULL,
      @now, @now
    )
    ON CONFLICT(user_id, event_provider, event_id) DO UPDATE SET
      calendar_id = excluded.calendar_id,
      issue_id = excluded.issue_id,
      event_date = excluded.event_date,
      start_hm = excluded.start_hm,
      end_hm = excluded.end_hm,
      title = excluded.title,
      memo = excluded.memo,
      hours = excluded.hours,
      owner_key = excluded.owner_key,
      updated_at = excluded.updated_at
    WHERE mari_calendar_stamps.status = 'pending'`
  ).run({
    userId,
    ownerKey,
    eventId: input.eventId,
    calendarId: input.calendarId ?? null,
    issueId: input.issueId,
    eventDate: input.eventDate,
    startHm: input.startHm ?? null,
    endHm: input.endHm ?? null,
    title: input.title.trim() || `Ticket #${input.issueId}`,
    memo: input.memo?.trim() || null,
    hours,
    now,
  });
  return getMariCalendarStamp(userId, "microsoft", input.eventId)!;
}

export function getMariCalendarStamp(
  userId: number,
  eventProvider: "microsoft",
  eventId: string
): MariCalendarStamp | null {
  ensureMariCalendarStampsTable();
  const row = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE user_id = ? AND event_provider = ? AND event_id = ?`
    )
    .get(userId, eventProvider, eventId) as Record<string, unknown> | undefined;
  return row ? mapStampRow(row) : null;
}

export function listPendingMariCalendarStamps(
  userId: number,
  opts?: {
    onOrBeforeDate?: string;
    onDate?: string;
  }
): MariCalendarStamp[] {
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const db = getDb();
  let sql = `SELECT * FROM mari_calendar_stamps WHERE user_id = ? AND status = 'pending' AND issue_id > 0`;
  const params: Array<string | number> = [userId];
  if (opts?.onDate) {
    sql += ` AND event_date = ?`;
    params.push(opts.onDate);
  } else if (opts?.onOrBeforeDate) {
    sql += ` AND event_date <= ?`;
    params.push(opts.onOrBeforeDate);
  }
  sql += ` ORDER BY event_date ASC, start_hm ASC, created_at ASC`;
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapStampRow);
}

export function listMariCalendarStampsForIssue(
  userId: number,
  issueId: number
): MariCalendarStamp[] {
  if (!Number.isInteger(issueId) || issueId <= 0) return [];
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const rows = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE user_id = ? AND issue_id = ? AND status IN ('pending', 'booked')
       ORDER BY event_date DESC, start_hm DESC, created_at DESC`
    )
    .all(userId, issueId) as Array<Record<string, unknown>>;
  return rows.map(mapStampRow);
}

export function getPrimaryMariCalendarStampForIssue(
  userId: number,
  issueId: number,
  todayYmd: string
): MariCalendarStamp | null {
  const stamps = listMariCalendarStampsForIssue(userId, issueId);
  return pickPrimaryStamp(stamps, todayYmd);
}

function pickPrimaryStamp(
  stamps: MariCalendarStamp[],
  todayYmd: string
): MariCalendarStamp | null {
  if (stamps.length === 0) return null;
  const upcoming = stamps
    .filter((s) => s.eventDate >= todayYmd)
    .sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
      return (a.startHm || "").localeCompare(b.startHm || "");
    });
  return upcoming[0] || stamps[0] || null;
}

export function mapPrimaryMariCalendarStampsByIssueIds(
  userId: number,
  issueIds: number[],
  todayYmd: string
): Record<number, MariCalendarStamp> {
  const ids = [
    ...new Set(issueIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (ids.length === 0) return {};
  requireUserId(userId);
  ensureMariCalendarStampsTable();
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT * FROM mari_calendar_stamps
       WHERE user_id = ? AND issue_id IN (${placeholders})
         AND status IN ('pending', 'booked')
       ORDER BY event_date DESC, start_hm DESC, created_at DESC`
    )
    .all(userId, ...ids) as Array<Record<string, unknown>>;
  const byIssue = new Map<number, MariCalendarStamp[]>();
  for (const row of rows) {
    const stamp = mapStampRow(row);
    const list = byIssue.get(stamp.issueId) || [];
    list.push(stamp);
    byIssue.set(stamp.issueId, list);
  }
  const out: Record<number, MariCalendarStamp> = {};
  for (const id of ids) {
    const primary = pickPrimaryStamp(byIssue.get(id) || [], todayYmd);
    if (primary) out[id] = primary;
  }
  return out;
}

export function deleteMariCalendarStamp(
  userId: number,
  eventProvider: "microsoft",
  eventId: string
): boolean {
  const uid = requireUserId(userId);
  const id = eventId.trim();
  if (!id) return false;
  ensureMariCalendarStampsTable();
  const result = getDb()
    .prepare(
      `DELETE FROM mari_calendar_stamps
       WHERE user_id = ? AND event_provider = ? AND event_id = ?`
    )
    .run(uid, eventProvider, id);
  return Number(result.changes) > 0;
}

/**
 * After a successful time booking from a calendar event: write or update
 * the stamp as `booked` so the event is not offered again.
 * Ticket events keep their issueId; normal Outlook events use issueId 0.
 */
export function markMariCalendarEventBooked(input: {
  userId: number;
  eventProvider?: "microsoft";
  eventId: string;
  calendarId?: string | null;
  issueId?: number | null;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  memo?: string | null;
  hours?: number | null;
  bookedLineId?: number | null;
}): MariCalendarStamp {
  const userId = requireUserId(input.userId);
  ensureMariCalendarStampsTable();
  const db = getDb();
  const now = new Date().toISOString();
  const hours =
    input.hours ??
    (input.startHm && input.endHm
      ? hoursBetweenHm(input.startHm, input.endHm)
      : null);
  const existing = getMariCalendarStamp(userId, "microsoft", input.eventId);
  const issueId =
    input.issueId != null && input.issueId > 0
      ? input.issueId
      : existing && existing.issueId > 0
        ? existing.issueId
        : HOURS_ONLY_STAMP_ISSUE_ID;
  const ownerKey = ownerKeyForUser(userId);
  const title =
    input.title.trim() ||
    (issueId > 0 ? `Ticket #${issueId}` : "Termin");
  db.prepare(
    `INSERT INTO mari_calendar_stamps (
      user_id, owner_key, event_provider, event_id, calendar_id, issue_id, event_date,
      start_hm, end_hm, title, memo, hours, status, booked_line_id,
      created_at, updated_at
    ) VALUES (
      @userId, @ownerKey, 'microsoft', @eventId, @calendarId, @issueId, @eventDate,
      @startHm, @endHm, @title, @memo, @hours, 'booked', @bookedLineId,
      @now, @now
    )
    ON CONFLICT(user_id, event_provider, event_id) DO UPDATE SET
      calendar_id = excluded.calendar_id,
      issue_id = CASE
        WHEN mari_calendar_stamps.issue_id > 0 THEN mari_calendar_stamps.issue_id
        ELSE excluded.issue_id
      END,
      event_date = excluded.event_date,
      start_hm = excluded.start_hm,
      end_hm = excluded.end_hm,
      title = excluded.title,
      memo = excluded.memo,
      hours = excluded.hours,
      status = 'booked',
      booked_line_id = COALESCE(excluded.booked_line_id, mari_calendar_stamps.booked_line_id),
      owner_key = excluded.owner_key,
      updated_at = excluded.updated_at`
  ).run({
    userId,
    ownerKey,
    eventId: input.eventId,
    calendarId: input.calendarId ?? existing?.calendarId ?? null,
    issueId,
    eventDate: input.eventDate,
    startHm: input.startHm ?? existing?.startHm ?? null,
    endHm: input.endHm ?? existing?.endHm ?? null,
    title,
    memo: input.memo?.trim() || existing?.memo || null,
    hours,
    bookedLineId: input.bookedLineId ?? null,
    now,
  });
  return getMariCalendarStamp(userId, "microsoft", input.eventId)!;
}

export function updateMariCalendarStampStatus(input: {
  userId: number;
  eventProvider?: "microsoft";
  eventId: string;
  status: MariCalendarStampStatus;
  bookedLineId?: number | null;
}): MariCalendarStamp | null {
  const userId = requireUserId(input.userId);
  ensureMariCalendarStampsTable();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE mari_calendar_stamps
       SET status = @status,
           booked_line_id = COALESCE(@bookedLineId, booked_line_id),
           updated_at = @now
       WHERE user_id = @userId AND event_provider = 'microsoft' AND event_id = @eventId`
    )
    .run({
      userId,
      eventId: input.eventId,
      status: input.status,
      bookedLineId: input.bookedLineId ?? null,
      now,
    });
  return getMariCalendarStamp(userId, "microsoft", input.eventId);
}

function mapStampRow(row: Record<string, unknown>): MariCalendarStamp {
  const userId = Number(row.user_id || 0);
  return {
    userId,
    ownerKey: String(row.owner_key || ownerKeyForUser(userId)),
    eventProvider: "microsoft",
    eventId: String(row.event_id),
    calendarId: (row.calendar_id as string) || null,
    issueId: Number(row.issue_id),
    eventDate: String(row.event_date),
    startHm: (row.start_hm as string) || null,
    endHm: (row.end_hm as string) || null,
    title: String(row.title || ""),
    memo: (row.memo as string) || null,
    hours: row.hours == null ? null : Number(row.hours),
    status: row.status as MariCalendarStampStatus,
    bookedLineId:
      row.booked_line_id == null ? null : Number(row.booked_line_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
