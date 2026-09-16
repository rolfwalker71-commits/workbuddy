import { getSetting, setSetting } from "@/lib/db/migrations";
import type { AuthContext } from "@/lib/auth/current-user";
import type { NotifyReason } from "@/lib/realtime/hub";
import { getDb } from "@/lib/db/client";
import {
  ALL_NOTIFY_REASONS,
  applyLegacyTicketReasonIntent,
  notifyReasonDefaultEnabled,
} from "@/lib/realtime/reason-catalog";

const GLOBAL_ENABLED_KEY = "live_notifications_enabled";
const GLOBAL_DURATION_KEY = "live_notifications_duration_sec";
const GLOBAL_SOUND_KEY = "live_notifications_sound_enabled";
const GLOBAL_EVENTS_KEY = "live_notifications_events";
const GLOBAL_SCOPES_KEY = "live_notifications_mari_scopes";
const GLOBAL_QUIET_HOURS_KEY = "live_notifications_quiet_hours";

export const LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC = 9;
export const LIVE_NOTIFICATIONS_MIN_DURATION_SEC = 3;
export const LIVE_NOTIFICATIONS_MAX_DURATION_SEC = 60;

export {
  ALL_NOTIFY_REASONS,
  applyLegacyTicketReasonIntent,
  LEGACY_NOTIFY_REASONS,
  NOTIFY_REASON_DEFAULT_OFF,
  NOTIFY_REASON_DOMAIN,
  NOTIFY_REASON_LABELS,
  notifyReasonDefaultEnabled,
  notifyReasonVisibleForModules,
} from "@/lib/realtime/reason-catalog";
export type { NotifyReasonDomain } from "@/lib/realtime/reason-catalog";

export type UserNotificationPrefs = {
  enabled: boolean;
  soundEnabled: boolean;
  /** OS/Windows desktop notifications when the Buddy tab is in the background. */
  desktopEnabled: boolean;
  durationSec: number;
  /** Missing keys inherit default true */
  events: Partial<Record<NotifyReason, boolean>>;
  /** null / empty = all trips */
  tripIds: number[] | null;
  /** null / empty = all ledgers */
  ledgerIds: number[] | null;
  /** Welche Ticket-Mengen überhaupt Meldungen erzeugen. */
  mariTicketScopes: MariTicketScopePrefs;
  /** Kein Push ausserhalb der Arbeitszeit; Historie und Toast bleiben. */
  quietHours: QuietHoursPrefs;
};

export type MariTicketScopePrefs = {
  /** Tickets, bei denen ich als Bearbeiter eingetragen bin. */
  assigned: boolean;
  /** Jedes neu eingegangene Ticket, unabhängig von der Zuweisung. */
  allNew: boolean;
  /** Von mir mit dem Stern markierte Tickets. */
  watched: boolean;
};

export type QuietHoursPrefs = {
  enabled: boolean;
  /** "HH:MM" */
  startHm: string;
  endHm: string;
  weekdaysOnly: boolean;
};

export const DEFAULT_MARI_TICKET_SCOPES: MariTicketScopePrefs = {
  assigned: true,
  allNew: true,
  watched: true,
};

/**
 * Eingehende Änderungen: die verschachtelten Objekte dürfen teilweise kommen
 * (ein einzelner Schalter), die Sanitiser füllen den Rest auf.
 */
export type NotificationPrefsPatch = Omit<
  Partial<UserNotificationPrefs>,
  "mariTicketScopes" | "quietHours"
> & {
  mariTicketScopes?: Partial<MariTicketScopePrefs>;
  quietHours?: Partial<QuietHoursPrefs>;
};

export const DEFAULT_QUIET_HOURS: QuietHoursPrefs = {
  enabled: true,
  startHm: "08:00",
  endHm: "18:30",
  weekdaysOnly: true,
};

function clampDuration(n: number): number {
  return Math.min(
    LIVE_NOTIFICATIONS_MAX_DURATION_SEC,
    Math.max(LIVE_NOTIFICATIONS_MIN_DURATION_SEC, Math.round(n))
  );
}

export function defaultNotificationPrefs(): UserNotificationPrefs {
  const events: Partial<Record<NotifyReason, boolean>> = {};
  for (const r of ALL_NOTIFY_REASONS) {
    events[r] = notifyReasonDefaultEnabled(r);
  }
  return {
    enabled: true,
    soundEnabled: true,
    desktopEnabled: true,
    durationSec: LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
    events,
    tripIds: null,
    ledgerIds: null,
    mariTicketScopes: { ...DEFAULT_MARI_TICKET_SCOPES },
    quietHours: { ...DEFAULT_QUIET_HOURS },
  };
}

function parseEventsJson(
  raw: string | null | undefined
): Partial<Record<NotifyReason, boolean>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<NotifyReason, boolean>> = {};
    for (const r of ALL_NOTIFY_REASONS) {
      if (typeof parsed[r] === "boolean") out[r] = parsed[r];
    }
    return out;
  } catch {
    return {};
  }
}

function parseIdList(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : null;
}

function parseHm(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : fallback;
}

function parseScopes(
  raw: unknown,
  base: MariTicketScopePrefs
): MariTicketScopePrefs {
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Partial<Record<keyof MariTicketScopePrefs, unknown>>;
  return {
    assigned: typeof o.assigned === "boolean" ? o.assigned : base.assigned,
    allNew: typeof o.allNew === "boolean" ? o.allNew : base.allNew,
    watched: typeof o.watched === "boolean" ? o.watched : base.watched,
  };
}

function parseQuietHours(raw: unknown, base: QuietHoursPrefs): QuietHoursPrefs {
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Partial<Record<keyof QuietHoursPrefs, unknown>>;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
    startHm: parseHm(o.startHm, base.startHm),
    endHm: parseHm(o.endHm, base.endHm),
    weekdaysOnly:
      typeof o.weekdaysOnly === "boolean" ? o.weekdaysOnly : base.weekdaysOnly,
  };
}

export function mergeNotificationPrefs(
  partial: NotificationPrefsPatch | null | undefined
): UserNotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!partial) return base;
  return {
    enabled: partial.enabled ?? base.enabled,
    soundEnabled: partial.soundEnabled ?? base.soundEnabled,
    desktopEnabled: partial.desktopEnabled ?? base.desktopEnabled,
    durationSec: clampDuration(
      partial.durationSec ?? base.durationSec
    ),
    events: applyLegacyTicketReasonIntent(
      { ...base.events, ...partial.events },
      partial.events
    ),
    tripIds:
      partial.tripIds === undefined ? base.tripIds : partial.tripIds,
    ledgerIds:
      partial.ledgerIds === undefined ? base.ledgerIds : partial.ledgerIds,
    mariTicketScopes: parseScopes(
      partial.mariTicketScopes,
      base.mariTicketScopes
    ),
    quietHours: parseQuietHours(partial.quietHours, base.quietHours),
  };
}

/** Global defaults (admin / fallback). */
export function getGlobalNotificationPrefs(): UserNotificationPrefs {
  const enabledRaw = getSetting(GLOBAL_ENABLED_KEY);
  const enabled =
    enabledRaw == null || enabledRaw === ""
      ? true
      : enabledRaw === "1" || enabledRaw.toLowerCase() === "true";
  const soundRaw = getSetting(GLOBAL_SOUND_KEY);
  const soundEnabled =
    soundRaw == null || soundRaw === ""
      ? true
      : soundRaw === "1" || soundRaw.toLowerCase() === "true";
  const durRaw = getSetting(GLOBAL_DURATION_KEY);
  const dur =
    durRaw != null && durRaw !== "" ? Number.parseInt(durRaw, 10) : NaN;
  return mergeNotificationPrefs({
    enabled,
    soundEnabled,
    durationSec: Number.isFinite(dur)
      ? dur
      : LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
    events: parseEventsJson(getSetting(GLOBAL_EVENTS_KEY)),
    tripIds: null,
    ledgerIds: null,
    mariTicketScopes: parseJsonSetting(
      GLOBAL_SCOPES_KEY
    ) as Partial<MariTicketScopePrefs> | undefined,
    quietHours: parseJsonSetting(GLOBAL_QUIET_HOURS_KEY) as
      | Partial<QuietHoursPrefs>
      | undefined,
  });
}

export function saveGlobalNotificationPrefs(
  prefs: UserNotificationPrefs
): void {
  setSetting(GLOBAL_ENABLED_KEY, prefs.enabled ? "1" : "0");
  setSetting(GLOBAL_SOUND_KEY, prefs.soundEnabled ? "1" : "0");
  setSetting(GLOBAL_DURATION_KEY, String(clampDuration(prefs.durationSec)));
  setSetting(GLOBAL_EVENTS_KEY, JSON.stringify(prefs.events));
  // Ohne diese beiden könnte der env-Admin (auth.userId === null) Umfänge und
  // Ruhezeiten zwar umschalten, aber nie speichern — sie landen nicht in der
  // users-Tabelle, weil er dort keine Zeile hat.
  setSetting(GLOBAL_SCOPES_KEY, JSON.stringify(prefs.mariTicketScopes));
  setSetting(GLOBAL_QUIET_HOURS_KEY, JSON.stringify(prefs.quietHours));
}

/** Rohes JSON aus settings; ungültiges liefert undefined → Default greift. */
function parseJsonSetting(key: string): undefined | Record<string, unknown> {
  const raw = getSetting(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function getUserNotificationPrefsJson(
  userId: number
): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT notification_prefs FROM users WHERE id = ?`)
    .get(userId) as { notification_prefs: string | null } | undefined;
  return row?.notification_prefs ?? null;
}

export function setUserNotificationPrefsJson(
  userId: number,
  json: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE users SET notification_prefs = ?, updated_at = ? WHERE id = ?`
  ).run(json, new Date().toISOString(), userId);
}

export function getNotificationPrefsForAuth(
  auth: AuthContext
): UserNotificationPrefs {
  const global = getGlobalNotificationPrefs();
  if (!auth.userId) return global;
  const raw = getUserNotificationPrefsJson(auth.userId);
  if (!raw) return global;
  try {
    const parsed = JSON.parse(raw) as Partial<UserNotificationPrefs>;
    return mergeNotificationPrefs({
      ...parsed,
      tripIds: parseIdList(parsed.tripIds),
      ledgerIds: parseIdList(parsed.ledgerIds),
      events: parsed.events ?? {},
    });
  } catch {
    return global;
  }
}

export function getNotificationPrefsForOwnerKey(
  ownerKey: string
): UserNotificationPrefs {
  if (ownerKey === "admin") return getGlobalNotificationPrefs();
  const m = /^user:(\d+)$/.exec(ownerKey);
  if (!m) return getGlobalNotificationPrefs();
  const userId = Number(m[1]);
  const global = getGlobalNotificationPrefs();
  const raw = getUserNotificationPrefsJson(userId);
  if (!raw) return global;
  try {
    const parsed = JSON.parse(raw) as Partial<UserNotificationPrefs>;
    return mergeNotificationPrefs({
      ...parsed,
      tripIds: parseIdList(parsed.tripIds),
      ledgerIds: parseIdList(parsed.ledgerIds),
      events: parsed.events ?? {},
    });
  } catch {
    return global;
  }
}

export function saveNotificationPrefsForAuth(
  auth: AuthContext,
  prefs: NotificationPrefsPatch
): UserNotificationPrefs {
  const current = getNotificationPrefsForAuth(auth);
  // Verschachtelte Objekte einzeln überlagern: ein PUT mit nur einem Schalter
  // darf die übrigen nicht auf den Default zurücksetzen.
  const next = mergeNotificationPrefs({
    ...current,
    ...prefs,
    mariTicketScopes: {
      ...current.mariTicketScopes,
      ...(prefs.mariTicketScopes || {}),
    },
    quietHours: { ...current.quietHours, ...(prefs.quietHours || {}) },
  });
  if (!auth.userId) {
    saveGlobalNotificationPrefs(next);
    return getGlobalNotificationPrefs();
  }
  setUserNotificationPrefsJson(auth.userId, JSON.stringify(next));
  return next;
}

export function isReasonEnabled(
  prefs: UserNotificationPrefs,
  reason: NotifyReason
): boolean {
  if (!prefs.enabled) return false;
  const v = prefs.events[reason];
  // Fehlender Schlüssel heisst weiterhin "an" — ausser für die Arten, die
  // ausdrücklich ein Ja brauchen (siehe NOTIFY_REASON_DEFAULT_OFF).
  if (v === undefined) return notifyReasonDefaultEnabled(reason);
  return v;
}

export function passesScopeFilter(
  prefs: UserNotificationPrefs,
  input: { tripId?: number | null; ledgerId?: number | null }
): boolean {
  if (input.tripId != null && prefs.tripIds && prefs.tripIds.length > 0) {
    if (!prefs.tripIds.includes(input.tripId)) return false;
  }
  if (
    input.ledgerId != null &&
    prefs.ledgerIds &&
    prefs.ledgerIds.length > 0
  ) {
    if (!prefs.ledgerIds.includes(input.ledgerId)) return false;
  }
  return true;
}

/* ---- backwards-compatible global getters used by settings API ---- */

export function isLiveNotificationsEnabled(): boolean {
  return getGlobalNotificationPrefs().enabled;
}

export function setLiveNotificationsEnabled(enabled: boolean): void {
  const p = getGlobalNotificationPrefs();
  saveGlobalNotificationPrefs({ ...p, enabled });
}

export function getLiveNotificationsDurationSec(): number {
  return getGlobalNotificationPrefs().durationSec;
}

export function setLiveNotificationsDurationSec(seconds: number): void {
  const p = getGlobalNotificationPrefs();
  saveGlobalNotificationPrefs({ ...p, durationSec: clampDuration(seconds) });
}

export function isLiveNotificationsSoundEnabled(): boolean {
  return getGlobalNotificationPrefs().soundEnabled;
}

export function setLiveNotificationsSoundEnabled(enabled: boolean): void {
  const p = getGlobalNotificationPrefs();
  saveGlobalNotificationPrefs({ ...p, soundEnabled: enabled });
}
