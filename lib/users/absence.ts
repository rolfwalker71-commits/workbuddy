import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { sanitizeYmd } from "@/lib/mari/ttv";
import { getAppUserById } from "@/lib/users/queries";

export { isAbsentOn } from "@/lib/users/absence-shared";

export type UserAbsence = {
  userId: number;
  displayName: string;
  fromYmd: string;
  toYmd: string;
  message: string | null;
  outlookEventId: string | null;
  updatedAt: string;
};

export function ensureUserAbsenceTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_absence (
      user_id INTEGER PRIMARY KEY,
      from_ymd TEXT NOT NULL,
      to_ymd TEXT NOT NULL,
      message TEXT,
      outlook_event_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

function displayNameFor(userId: number): string {
  const user = getAppUserById(userId);
  const name = user?.display_name?.trim() || user?.username?.trim();
  return name || `User ${userId}`;
}

function mapRow(row: {
  user_id: number;
  from_ymd: string;
  to_ymd: string;
  message: string | null;
  outlook_event_id: string | null;
  updated_at: string;
}): UserAbsence {
  return {
    userId: Number(row.user_id),
    displayName: displayNameFor(Number(row.user_id)),
    fromYmd: String(row.from_ymd),
    toYmd: String(row.to_ymd),
    message: (row.message || "").trim() || null,
    outlookEventId: (row.outlook_event_id || "").trim() || null,
    updatedAt: String(row.updated_at),
  };
}

export function getUserAbsence(userId: number): UserAbsence | null {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  ensureUserAbsenceTable();
  const row = getDb()
    .prepare(
      `SELECT user_id, from_ymd, to_ymd, message, outlook_event_id, updated_at
       FROM user_absence WHERE user_id = ?`
    )
    .get(userId) as
    | {
        user_id: number;
        from_ymd: string;
        to_ymd: string;
        message: string | null;
        outlook_event_id: string | null;
        updated_at: string;
      }
    | undefined;
  return row ? mapRow(row) : null;
}

export function listAbsencesOnDay(ymd: string): UserAbsence[] {
  const day = sanitizeYmd(ymd);
  if (!day) return [];
  ensureUserAbsenceTable();
  const rows = getDb()
    .prepare(
      `SELECT user_id, from_ymd, to_ymd, message, outlook_event_id, updated_at
       FROM user_absence
       WHERE from_ymd <= ? AND to_ymd >= ?
       ORDER BY from_ymd ASC, user_id ASC`
    )
    .all(day, day) as Array<{
    user_id: number;
    from_ymd: string;
    to_ymd: string;
    message: string | null;
    outlook_event_id: string | null;
    updated_at: string;
  }>;
  return rows.map(mapRow);
}

export function setUserAbsence(input: {
  userId: number;
  fromYmd: string;
  toYmd: string;
  message?: string | null;
  outlookEventId?: string | null;
}): UserAbsence {
  const fromYmd = sanitizeYmd(input.fromYmd);
  const toYmd = sanitizeYmd(input.toYmd);
  if (!fromYmd || !toYmd) throw new Error("Zeitraum ungültig.");
  if (toYmd < fromYmd) throw new Error("Ende liegt vor dem Start.");
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    throw new Error("User ungültig.");
  }
  ensureUserAbsenceTable();
  const updatedAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO user_absence (
         user_id, from_ymd, to_ymd, message, outlook_event_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         from_ymd = excluded.from_ymd,
         to_ymd = excluded.to_ymd,
         message = excluded.message,
         outlook_event_id = excluded.outlook_event_id,
         updated_at = excluded.updated_at`
    )
    .run(
      input.userId,
      fromYmd,
      toYmd,
      input.message?.trim() || null,
      input.outlookEventId?.trim() || null,
      updatedAt
    );
  return getUserAbsence(input.userId)!;
}

export function clearUserAbsence(userId: number): UserAbsence | null {
  const existing = getUserAbsence(userId);
  if (!existing) return null;
  getDb().prepare(`DELETE FROM user_absence WHERE user_id = ?`).run(userId);
  return existing;
}
