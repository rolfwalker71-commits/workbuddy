import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  parsePresenceDefaultWeek,
  serializePresenceDefaultWeek,
  type PresenceDefaultWeek,
} from "@/lib/presence/default-week";

export function getUserPresenceDefaultWeek(userId: number): PresenceDefaultWeek {
  if (!Number.isInteger(userId) || userId <= 0) return {};
  const row = getDb()
    .prepare(`SELECT presence_default_week FROM users WHERE id = ?`)
    .get(userId) as { presence_default_week: string | null } | undefined;
  return parsePresenceDefaultWeek(row?.presence_default_week);
}

export function setUserPresenceDefaultWeek(
  userId: number,
  week: PresenceDefaultWeek
): PresenceDefaultWeek {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("User ungültig.");
  }
  const parsed = parsePresenceDefaultWeek(week);
  const json = serializePresenceDefaultWeek(parsed);
  const result = getDb()
    .prepare(
      `UPDATE users SET presence_default_week = ?, updated_at = ? WHERE id = ?`
    )
    .run(json, nowIso(), userId);
  if (result.changes < 1) {
    throw new Error("Benutzer nicht gefunden");
  }
  return parsed;
}
