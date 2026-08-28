/**
 * Browser-safe helpers for notification prefs (no Node/db imports).
 * Keep in sync with lib/realtime/prefs.ts defaults.
 */

import type { NotifyReason } from "@/lib/realtime/hub";

export type UserNotificationPrefs = {
  enabled: boolean;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  durationSec: number;
  events: Partial<Record<NotifyReason, boolean>>;
  tripIds: number[] | null;
  ledgerIds: number[] | null;
};

const ALL: NotifyReason[] = [
  "mari_ticket_changed",
  "mail_calendar_patch",
  "microsoft_mail_day",
  "microsoft_teams_day",
  "google_mail_day",
  "evening_digest",
  "app_status",
];

export function mergeNotificationPrefs(
  partial: Partial<UserNotificationPrefs> | null | undefined
): UserNotificationPrefs {
  const events: Partial<Record<NotifyReason, boolean>> = {};
  for (const r of ALL) {
    events[r] = true;
  }
  const base: UserNotificationPrefs = {
    enabled: true,
    soundEnabled: true,
    desktopEnabled: true,
    durationSec: 9,
    events,
    tripIds: null,
    ledgerIds: null,
  };
  if (!partial) return base;
  return {
    enabled: partial.enabled ?? base.enabled,
    soundEnabled: partial.soundEnabled ?? base.soundEnabled,
    desktopEnabled: partial.desktopEnabled ?? base.desktopEnabled,
    durationSec: partial.durationSec ?? base.durationSec,
    events: { ...base.events, ...partial.events },
    tripIds: partial.tripIds === undefined ? base.tripIds : partial.tripIds,
    ledgerIds:
      partial.ledgerIds === undefined ? base.ledgerIds : partial.ledgerIds,
  };
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
