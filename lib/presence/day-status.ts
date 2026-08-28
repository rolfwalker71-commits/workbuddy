import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { sanitizeYmd } from "@/lib/mari/ttv";
import {
  getAppUserById,
  listActiveAppUsers,
} from "@/lib/users/queries";
import { isEnvAdminUsername } from "@/lib/users/resolve-user";
import {
  parseUserOrganization,
  type UserOrganization,
} from "@/lib/users/organization";
import {
  isProtectedPresenceSource,
  parsePresenceSource,
  parsePresenceStatus,
  type PresenceSource,
  type PresenceStatus,
} from "@/lib/presence/status";
import { resolveDayStatus, layersFromStored, type PresenceLayer } from "@/lib/presence/resolve";
import { canDelegatePresence } from "@/lib/presence/delegate";
import { weekdaysMonFri } from "@/lib/presence/week";
import {
  defaultStatusForYmd,
  parsePresenceDefaultWeek,
} from "@/lib/presence/default-week";

export type UserDayStatus = PresenceLayer & {
  userId: number;
  ymd: string;
};

export type PresencePerson = {
  userId: number;
  displayName: string;
  organization: UserOrganization | null;
  canManagePresence: boolean;
  status: PresenceStatus | null;
  source: PresenceSource | null;
  setByUserId: number | null;
  note: string | null;
  updatedAt: string | null;
};

export function ensureUserDayStatusTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_day_status (
      user_id INTEGER NOT NULL,
      ymd TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      set_by_user_id INTEGER,
      note TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, ymd),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(set_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_day_status_ymd
      ON user_day_status(ymd);
  `);
}

function mapRow(row: {
  user_id: number;
  ymd: string;
  status: string;
  source: string;
  set_by_user_id: number | null;
  note: string | null;
  updated_at: string;
}): UserDayStatus | null {
  const status = parsePresenceStatus(row.status);
  const source = parsePresenceSource(row.source);
  if (!status || !source) return null;
  return {
    userId: Number(row.user_id),
    ymd: String(row.ymd),
    status,
    source,
    setByUserId:
      row.set_by_user_id != null ? Number(row.set_by_user_id) : null,
    note: (row.note || "").trim() || null,
    updatedAt: String(row.updated_at),
  };
}

export function getUserDayStatus(
  userId: number,
  ymd: string
): UserDayStatus | null {
  const day = sanitizeYmd(ymd);
  if (!day || !Number.isInteger(userId) || userId <= 0) return null;
  ensureUserDayStatusTable();
  const row = getDb()
    .prepare(
      `SELECT user_id, ymd, status, source, set_by_user_id, note, updated_at
       FROM user_day_status WHERE user_id = ? AND ymd = ?`
    )
    .get(userId, day) as
    | {
        user_id: number;
        ymd: string;
        status: string;
        source: string;
        set_by_user_id: number | null;
        note: string | null;
        updated_at: string;
      }
    | undefined;
  return row ? mapRow(row) : null;
}

export function listDayStatuses(ymd: string): UserDayStatus[] {
  const day = sanitizeYmd(ymd);
  if (!day) return [];
  ensureUserDayStatusTable();
  const rows = getDb()
    .prepare(
      `SELECT user_id, ymd, status, source, set_by_user_id, note, updated_at
       FROM user_day_status WHERE ymd = ?`
    )
    .all(day) as Array<{
    user_id: number;
    ymd: string;
    status: string;
    source: string;
    set_by_user_id: number | null;
    note: string | null;
    updated_at: string;
  }>;
  return rows.map(mapRow).filter((row): row is UserDayStatus => row != null);
}

export function listUserWeekStatuses(
  userId: number,
  fromYmd: string
): UserDayStatus[] {
  const days = weekdaysMonFri(fromYmd);
  if (!days || !Number.isInteger(userId) || userId <= 0) return [];
  ensureUserDayStatusTable();
  const rows = getDb()
    .prepare(
      `SELECT user_id, ymd, status, source, set_by_user_id, note, updated_at
       FROM user_day_status
       WHERE user_id = ? AND ymd >= ? AND ymd <= ?
       ORDER BY ymd ASC`
    )
    .all(userId, days[0], days[4]) as Array<{
    user_id: number;
    ymd: string;
    status: string;
    source: string;
    set_by_user_id: number | null;
    note: string | null;
    updated_at: string;
  }>;
  return rows.map(mapRow).filter((row): row is UserDayStatus => row != null);
}

export function upsertUserDayStatus(input: {
  userId: number;
  ymd: string;
  status: PresenceStatus;
  source: PresenceSource;
  setByUserId: number;
  note?: string | null;
}): UserDayStatus {
  const ymd = sanitizeYmd(input.ymd);
  if (!ymd) throw new Error("Datum ungültig.");
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    throw new Error("User ungültig.");
  }
  if (!Number.isInteger(input.setByUserId) || input.setByUserId <= 0) {
    throw new Error("User ungültig.");
  }
  ensureUserDayStatusTable();
  const updatedAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO user_day_status (
         user_id, ymd, status, source, set_by_user_id, note, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, ymd) DO UPDATE SET
         status = excluded.status,
         source = excluded.source,
         set_by_user_id = excluded.set_by_user_id,
         note = excluded.note,
         updated_at = excluded.updated_at`
    )
    .run(
      input.userId,
      ymd,
      input.status,
      input.source,
      input.setByUserId,
      input.note?.trim() || null,
      updatedAt
    );
  return getUserDayStatus(input.userId, ymd)!;
}

export function deleteUserDayStatus(userId: number, ymd: string): boolean {
  const day = sanitizeYmd(ymd);
  if (!day || !Number.isInteger(userId) || userId <= 0) return false;
  ensureUserDayStatusTable();
  const result = getDb()
    .prepare(`DELETE FROM user_day_status WHERE user_id = ? AND ymd = ?`)
    .run(userId, day);
  return result.changes > 0;
}

export function clearOwnDayStatus(userId: number, ymd: string): boolean {
  const existing = getUserDayStatus(userId, ymd);
  if (!existing) return false;
  if (isProtectedPresenceSource(existing.source)) {
    throw new Error(
      "Dieser Tag wurde von einer Stellvertretung oder Outlook gesetzt."
    );
  }
  return deleteUserDayStatus(userId, ymd);
}

export function setOwnDayStatus(input: {
  userId: number;
  ymd: string;
  status: PresenceStatus;
}): UserDayStatus {
  const existing = getUserDayStatus(input.userId, input.ymd);
  if (isProtectedPresenceSource(existing?.source)) {
    throw new Error(
      "Dieser Tag wurde von einer Stellvertretung oder Outlook gesetzt."
    );
  }
  return upsertUserDayStatus({
    userId: input.userId,
    ymd: input.ymd,
    status: input.status,
    source: "self",
    setByUserId: input.userId,
  });
}

export function setOwnWeekStatus(input: {
  userId: number;
  fromYmd: string;
  days: Array<{ ymd: string; status: PresenceStatus }>;
}): {
  fromYmd: string;
  days: UserDayStatus[];
  skipped: Array<{ ymd: string; reason: "protected" }>;
} {
  const weekdays = weekdaysMonFri(input.fromYmd);
  if (!weekdays) throw new Error("Datum ungültig.");
  const allowed = new Set(weekdays);
  const skipped: Array<{ ymd: string; reason: "protected" }> = [];

  for (const day of input.days) {
    const ymd = sanitizeYmd(day.ymd);
    if (!ymd || !allowed.has(ymd)) {
      throw new Error("Tag liegt nicht in dieser Arbeitswoche.");
    }
    const existing = getUserDayStatus(input.userId, ymd);
    if (isProtectedPresenceSource(existing?.source)) {
      skipped.push({ ymd, reason: "protected" });
      continue;
    }
    upsertUserDayStatus({
      userId: input.userId,
      ymd,
      status: day.status,
      source: "self",
      setByUserId: input.userId,
    });
  }

  return {
    fromYmd: weekdays[0],
    days: listUserWeekStatuses(input.userId, weekdays[0]),
    skipped,
  };
}

export function setDelegatedDayStatus(input: {
  actor: {
    userId: number;
    isAdmin: boolean;
    canManagePresence: boolean;
    organization: UserOrganization | null;
  };
  targetUserId: number;
  ymd: string;
  status: PresenceStatus;
}): UserDayStatus {
  const target = getAppUserById(input.targetUserId);
  if (!target) throw new Error("Benutzer nicht gefunden");
  if (isEnvAdminUsername(target.username)) {
    throw new Error("Dieser Benutzer ist kein Teammitglied.");
  }
  const allowed = canDelegatePresence(
    {
      isAdmin: input.actor.isAdmin,
      canManagePresence: input.actor.canManagePresence,
      organization: input.actor.organization,
    },
    { organization: parseUserOrganization(target.organization) }
  );
  if (!allowed) {
    throw new Error("Keine Berechtigung für diese Organisation.");
  }
  return upsertUserDayStatus({
    userId: input.targetUserId,
    ymd: input.ymd,
    status: input.status,
    source: "deputy",
    setByUserId: input.actor.userId,
  });
}

function defaultLayerForUser(
  user: { presence_default_week?: string | null },
  ymd: string
): PresenceLayer | null {
  const status = defaultStatusForYmd(
    parsePresenceDefaultWeek(user.presence_default_week),
    ymd
  );
  if (!status) return null;
  return {
    status,
    source: "default",
    setByUserId: null,
    note: null,
    updatedAt: "",
  };
}

function personFromUser(
  user: {
    id: number;
    display_name: string;
    username: string;
    organization: UserOrganization | null;
    can_manage_presence: number;
    presence_default_week?: string | null;
  },
  row: UserDayStatus | null,
  ymd: string
): PresencePerson {
  const resolved = resolveDayStatus({
    ...layersFromStored(row),
    default: defaultLayerForUser(user, ymd),
  });
  return {
    userId: user.id,
    displayName: user.display_name?.trim() || user.username,
    organization: parseUserOrganization(user.organization),
    canManagePresence: Boolean(user.can_manage_presence),
    status: resolved?.status ?? null,
    source: resolved?.source ?? null,
    setByUserId: resolved?.setByUserId ?? null,
    note: resolved?.note ?? null,
    updatedAt:
      resolved?.source === "default" ? null : resolved?.updatedAt ?? null,
  };
}

export function listPresenceToday(input: {
  ymd: string;
  organization?: UserOrganization | null;
  viewerUserId: number | null;
}): {
  ymd: string;
  organization: UserOrganization | null;
  self: PresencePerson | null;
  people: PresencePerson[];
} {
  const ymd = sanitizeYmd(input.ymd);
  if (!ymd) throw new Error("Datum ungültig.");
  const orgFilter = input.organization ?? null;
  const byUser = new Map(
    listDayStatuses(ymd).map((row) => [row.userId, row])
  );
  const users = listActiveAppUsers();
  const people = users
    .filter((user) => !isEnvAdminUsername(user.username))
    .filter((user) => {
      if (!orgFilter) return true;
      return parseUserOrganization(user.organization) === orgFilter;
    })
    .map((user) => personFromUser(user, byUser.get(user.id) ?? null, ymd));

  const viewer =
    input.viewerUserId != null
      ? users.find((u) => u.id === input.viewerUserId) ??
        getAppUserById(input.viewerUserId)
      : null;
  const self = viewer
    ? personFromUser(viewer, byUser.get(viewer.id) ?? null, ymd)
    : null;

  return {
    ymd,
    organization: orgFilter,
    self,
    people,
  };
}
