import { getSetting, setSetting } from "@/lib/db/migrations";
import type { AuthContext } from "@/lib/auth/current-user";
import type { NotifyReason } from "@/lib/realtime/hub";
import { getDb } from "@/lib/db/client";

const GLOBAL_ENABLED_KEY = "live_notifications_enabled";
const GLOBAL_DURATION_KEY = "live_notifications_duration_sec";
const GLOBAL_SOUND_KEY = "live_notifications_sound_enabled";
const GLOBAL_EVENTS_KEY = "live_notifications_events";

export const LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC = 9;
export const LIVE_NOTIFICATIONS_MIN_DURATION_SEC = 3;
export const LIVE_NOTIFICATIONS_MAX_DURATION_SEC = 60;

export type NotifyReasonDomain = "maringo" | "microsoft" | "google" | "app";

export const ALL_NOTIFY_REASONS: NotifyReason[] = [
  "mari_ticket_changed",
  "mail_calendar_patch",
  "microsoft_mail_day",
  "google_mail_day",
  "evening_digest",
  "app_status",
];

export const NOTIFY_REASON_LABELS: Record<NotifyReason, string> = {
  mari_ticket_changed: "Maringo Ticket-Update",
  mail_calendar_patch: "Termin aus Mail aktualisiert",
  microsoft_mail_day: "Microsoft Tagesanalyse",
  google_mail_day: "Gmail-Tagesanalyse",
  evening_digest: "Tagesabschluss (Abend)",
  app_status: "App-Hinweis",
};

export const NOTIFY_REASON_DOMAIN: Record<NotifyReason, NotifyReasonDomain> = {
  mari_ticket_changed: "maringo",
  mail_calendar_patch: "microsoft",
  microsoft_mail_day: "microsoft",
  google_mail_day: "google",
  evening_digest: "app",
  app_status: "app",
};

export function notifyReasonVisibleForModules(
  reason: NotifyReason,
  modules: readonly string[],
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  const domain = NOTIFY_REASON_DOMAIN[reason];
  if (domain === "app") {
    if (reason === "evening_digest") {
      return modules.includes("microsoft") || modules.includes("google");
    }
    return true;
  }
  return modules.includes(domain);
}

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
    events[r] = true;
  }
  return {
    enabled: true,
    soundEnabled: true,
    desktopEnabled: true,
    durationSec: LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
    events,
    tripIds: null,
    ledgerIds: null,
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

export function mergeNotificationPrefs(
  partial: Partial<UserNotificationPrefs> | null | undefined
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
    events: { ...base.events, ...partial.events },
    tripIds:
      partial.tripIds === undefined ? base.tripIds : partial.tripIds,
    ledgerIds:
      partial.ledgerIds === undefined ? base.ledgerIds : partial.ledgerIds,
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
  });
}

export function saveGlobalNotificationPrefs(
  prefs: UserNotificationPrefs
): void {
  setSetting(GLOBAL_ENABLED_KEY, prefs.enabled ? "1" : "0");
  setSetting(GLOBAL_SOUND_KEY, prefs.soundEnabled ? "1" : "0");
  setSetting(GLOBAL_DURATION_KEY, String(clampDuration(prefs.durationSec)));
  setSetting(GLOBAL_EVENTS_KEY, JSON.stringify(prefs.events));
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
  prefs: Partial<UserNotificationPrefs>
): UserNotificationPrefs {
  const current = getNotificationPrefsForAuth(auth);
  const next = mergeNotificationPrefs({ ...current, ...prefs });
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
  if (v === undefined) return true;
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
