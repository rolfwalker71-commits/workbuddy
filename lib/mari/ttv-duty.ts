import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { getAppUserById } from "@/lib/users/queries";
import { sanitizeYmd } from "@/lib/mari/ttv";

export { isClaimableYmd, weekRangeFrom } from "@/lib/mari/ttv-duty-shared";

export type TtvDutySource = "admin" | "claim";

export type TtvDutyEntry = {
  ymd: string;
  userId: number;
  displayName: string;
  source: TtvDutySource;
  updatedAt: string;
};

const SOURCE = new Set<TtvDutySource>(["admin", "claim"]);

export function ensureTtvDutyTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ttv_duty (
      ymd TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ttv_duty_user ON ttv_duty(user_id, ymd);
  `);
}

function displayNameFor(userId: number): string {
  const user = getAppUserById(userId);
  const name = user?.display_name?.trim() || user?.username?.trim();
  return name || `User ${userId}`;
}

function mapRow(row: {
  ymd: string;
  user_id: number;
  source: string;
  updated_at: string;
}): TtvDutyEntry {
  return {
    ymd: String(row.ymd),
    userId: Number(row.user_id),
    displayName: displayNameFor(Number(row.user_id)),
    source: SOURCE.has(row.source as TtvDutySource)
      ? (row.source as TtvDutySource)
      : "claim",
    updatedAt: String(row.updated_at),
  };
}

export function getTtvDutyForDay(ymd: string): TtvDutyEntry | null {
  const day = sanitizeYmd(ymd);
  if (!day) return null;
  ensureTtvDutyTable();
  const row = getDb()
    .prepare(
      `SELECT ymd, user_id, source, updated_at FROM ttv_duty WHERE ymd = ?`
    )
    .get(day) as
    | { ymd: string; user_id: number; source: string; updated_at: string }
    | undefined;
  return row ? mapRow(row) : null;
}

export function listTtvDuty(
  fromYmd: string,
  toYmd: string
): TtvDutyEntry[] {
  const from = sanitizeYmd(fromYmd);
  const to = sanitizeYmd(toYmd);
  if (!from || !to || from > to) return [];
  ensureTtvDutyTable();
  const rows = getDb()
    .prepare(
      `SELECT ymd, user_id, source, updated_at
       FROM ttv_duty
       WHERE ymd >= ? AND ymd <= ?
       ORDER BY ymd ASC`
    )
    .all(from, to) as Array<{
    ymd: string;
    user_id: number;
    source: string;
    updated_at: string;
  }>;
  return rows.map(mapRow);
}

export function setTtvDuty(input: {
  ymd: string;
  userId: number;
  source: TtvDutySource;
}): TtvDutyEntry {
  const ymd = sanitizeYmd(input.ymd);
  if (!ymd) throw new Error("Datum ungültig.");
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    throw new Error("User ungültig.");
  }
  if (!getAppUserById(input.userId)) {
    throw new Error("User nicht gefunden.");
  }
  ensureTtvDutyTable();
  const updatedAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO ttv_duty (ymd, user_id, source, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ymd) DO UPDATE SET
         user_id = excluded.user_id,
         source = excluded.source,
         updated_at = excluded.updated_at`
    )
    .run(ymd, input.userId, input.source, updatedAt);
  return getTtvDutyForDay(ymd)!;
}

export function clearTtvDuty(ymd: string): void {
  const day = sanitizeYmd(ymd);
  if (!day) throw new Error("Datum ungültig.");
  ensureTtvDutyTable();
  getDb().prepare(`DELETE FROM ttv_duty WHERE ymd = ?`).run(day);
}

