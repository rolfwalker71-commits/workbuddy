/**
 * Gespeicherte Benachrichtigungen (server-only).
 *
 * Vor dieser Tabelle waren Benachrichtigungen rein flüchtig: ein Toast, vier
 * Stück gleichzeitig, danach weg. Wer nicht gerade im Browser war, hat das
 * Ereignis nie gesehen.
 */
import { getDb } from "@/lib/db/client";
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import {
  resolveNotificationRecipients,
  type NotificationCandidate,
} from "@/lib/notifications/recipients";
import {
  effectiveUserModules,
  listActiveAppUsers,
} from "@/lib/users/queries";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";

/** Älter als das wird weggeräumt. */
export const NOTIFICATION_RETENTION_DAYS = 30;
/** Zusätzliche Obergrenze je Empfänger, damit ein lauter Tag nichts sprengt. */
export const NOTIFICATION_KEEP_PER_OWNER = 200;

export type StoredNotification = {
  id: number;
  domain: string;
  reason: string;
  headline: string;
  title: string | null;
  detail: string | null;
  href: string | null;
  category: string | null;
  meta: string | null;
  source: string;
  createdAt: string;
  readAt: string | null;
  /** Serverseitig in Europe/Zurich aufgelöst — der Client gruppiert nur noch. */
  ymd: string;
  timeHm: string;
};

type Row = {
  id: number;
  domain: string;
  reason: string;
  headline: string;
  title: string | null;
  detail: string | null;
  href: string | null;
  category: string | null;
  meta: string | null;
  source: string;
  created_at: string;
  read_at: string | null;
};

function mapRow(row: Row): StoredNotification {
  const created = new Date(row.created_at);
  const valid = !Number.isNaN(created.getTime());
  return {
    id: Number(row.id),
    domain: row.domain,
    reason: row.reason,
    headline: row.headline,
    title: row.title,
    detail: row.detail,
    href: row.href,
    category: row.category,
    meta: row.meta,
    source: row.source,
    createdAt: row.created_at,
    readAt: row.read_at,
    ymd: valid ? zurichYmd(created) : "",
    timeHm: valid ? zurichHm(created) : "",
  };
}

/**
 * Kandidaten für den Fan-out: alle aktiven Benutzer plus der env-Admin, der
 * keine Benutzerzeile hat (owner_key "admin", `auth.userId` ist dort `null`).
 */
function notificationCandidates(): NotificationCandidate[] {
  const users = listActiveAppUsers();
  const candidates: NotificationCandidate[] = users.map((user) => {
    const isAdmin = Number(user.is_admin) === 1;
    return {
      ownerKey: `user:${user.id}`,
      userId: user.id,
      modules: effectiveUserModules(user.id, isAdmin),
      isAdmin,
    };
  });
  candidates.push({
    ownerKey: "admin",
    userId: null,
    modules: [],
    isAdmin: true,
  });
  return candidates;
}

/** Schreibt je Empfänger eine Zeile. Wirft nie — der Emitter darf nicht fallen. */
export function recordNotification(
  notification: AppNotifyPayload,
  at: string
): number {
  try {
    const recipients = resolveNotificationRecipients(
      notification,
      notificationCandidates()
    );
    if (recipients.length === 0) return 0;

    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO user_notifications (
         owner_key, user_id, domain, reason, headline, title, detail,
         href, category, meta, source, created_at, read_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    );
    const writeAll = db.transaction((rows: typeof recipients) => {
      for (const row of rows) {
        insert.run(
          row.ownerKey,
          row.userId,
          notification.domain,
          notification.reason,
          notification.headline,
          notification.title,
          notification.detail,
          notification.href,
          notification.category,
          notification.meta,
          notification.source,
          at
        );
      }
    });
    writeAll(recipients);
    return recipients.length;
  } catch (error) {
    console.warn(
      "[workbuddy] could not record notification:",
      error instanceof Error ? error.message : error
    );
    return 0;
  }
}

export function listNotifications(
  ownerKey: string,
  options?: { limit?: number; before?: string | null }
): { items: StoredNotification[]; hasMore: boolean } {
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const before = options?.before?.trim() || null;
  // Ein Mehr abfragen, um `hasMore` ohne zweites COUNT zu beantworten.
  const rows = before
    ? (getDb()
        .prepare(
          `SELECT * FROM user_notifications
           WHERE owner_key = ? AND created_at < ?
           ORDER BY created_at DESC, id DESC LIMIT ?`
        )
        .all(ownerKey, before, limit + 1) as Row[])
    : (getDb()
        .prepare(
          `SELECT * FROM user_notifications
           WHERE owner_key = ?
           ORDER BY created_at DESC, id DESC LIMIT ?`
        )
        .all(ownerKey, limit + 1) as Row[]);
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit).map(mapRow), hasMore };
}

export function countUnreadNotifications(ownerKey: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM user_notifications
       WHERE owner_key = ? AND read_at IS NULL`
    )
    .get(ownerKey) as { n?: number } | undefined;
  return Number(row?.n ?? 0);
}

/**
 * `owner_key` steht in jedem Statement: eine untergeschobene fremde ID darf
 * keine fremde Zeile treffen.
 */
export function markNotificationsRead(
  ownerKey: string,
  ids: readonly number[]
): number {
  const clean = [
    ...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)),
  ].slice(0, 200);
  if (clean.length === 0) return 0;
  const now = new Date().toISOString();
  const placeholders = clean.map(() => "?").join(", ");
  const result = getDb()
    .prepare(
      `UPDATE user_notifications SET read_at = ?
       WHERE owner_key = ? AND read_at IS NULL AND id IN (${placeholders})`
    )
    .run(now, ownerKey, ...clean);
  return Number(result.changes ?? 0);
}

export function markAllNotificationsRead(ownerKey: string): number {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `UPDATE user_notifications SET read_at = ?
       WHERE owner_key = ? AND read_at IS NULL`
    )
    .run(now, ownerKey);
  return Number(result.changes ?? 0);
}

/** Alt und Überzahl wegräumen. Wirft nie (Scheduler-Schritt). */
export function pruneNotifications(
  days: number = NOTIFICATION_RETENTION_DAYS,
  keepPerOwner: number = NOTIFICATION_KEEP_PER_OWNER
): number {
  try {
    const keepDays =
      Number.isFinite(days) && days > 0
        ? Math.floor(days)
        : NOTIFICATION_RETENTION_DAYS;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
    const db = getDb();
    let deleted = Number(
      db
        .prepare(`DELETE FROM user_notifications WHERE created_at < ?`)
        .run(cutoff.toISOString()).changes ?? 0
    );

    const owners = db
      .prepare(`SELECT DISTINCT owner_key FROM user_notifications`)
      .all() as Array<{ owner_key: string }>;
    const trim = db.prepare(
      `DELETE FROM user_notifications
       WHERE owner_key = ? AND id NOT IN (
         SELECT id FROM user_notifications
         WHERE owner_key = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?
       )`
    );
    for (const owner of owners) {
      deleted += Number(
        trim.run(owner.owner_key, owner.owner_key, keepPerOwner).changes ?? 0
      );
    }
    return deleted;
  } catch (error) {
    console.warn(
      "[workbuddy] pruneNotifications failed:",
      error instanceof Error ? error.message : error
    );
    return 0;
  }
}
