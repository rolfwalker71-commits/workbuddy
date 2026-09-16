/**
 * Browser-safe helpers for notification prefs (no Node/db imports).
 * Defaults mirror lib/realtime/prefs.ts; the reason list itself comes from the
 * shared catalog so the two cannot drift apart.
 */

import type { NotifyReason } from "@/lib/realtime/hub";
import {
  ALL_NOTIFY_REASONS,
  applyLegacyTicketReasonIntent,
  notifyReasonDefaultEnabled,
} from "@/lib/realtime/reason-catalog";

export type UserNotificationPrefs = {
  enabled: boolean;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  durationSec: number;
  events: Partial<Record<NotifyReason, boolean>>;
  tripIds: number[] | null;
  ledgerIds: number[] | null;
  mariTicketScopes: MariTicketScopePrefs;
  quietHours: QuietHoursPrefs;
};

export type MariTicketScopePrefs = {
  assigned: boolean;
  allNew: boolean;
  watched: boolean;
};

export type QuietHoursPrefs = {
  enabled: boolean;
  startHm: string;
  endHm: string;
  weekdaysOnly: boolean;
};

export const DEFAULT_MARI_TICKET_SCOPES: MariTicketScopePrefs = {
  assigned: true,
  allNew: true,
  watched: true,
};

export const DEFAULT_QUIET_HOURS: QuietHoursPrefs = {
  enabled: true,
  startHm: "08:00",
  endHm: "18:30",
  weekdaysOnly: true,
};

export type NotificationPrefsPatch = Omit<
  Partial<UserNotificationPrefs>,
  "mariTicketScopes" | "quietHours"
> & {
  mariTicketScopes?: Partial<MariTicketScopePrefs>;
  quietHours?: Partial<QuietHoursPrefs>;
};

export function mergeNotificationPrefs(
  partial: NotificationPrefsPatch | null | undefined
): UserNotificationPrefs {
  const events: Partial<Record<NotifyReason, boolean>> = {};
  for (const r of ALL_NOTIFY_REASONS) {
    events[r] = notifyReasonDefaultEnabled(r);
  }
  const base: UserNotificationPrefs = {
    enabled: true,
    soundEnabled: true,
    desktopEnabled: true,
    durationSec: 9,
    events,
    tripIds: null,
    ledgerIds: null,
    mariTicketScopes: { ...DEFAULT_MARI_TICKET_SCOPES },
    quietHours: { ...DEFAULT_QUIET_HOURS },
  };
  if (!partial) return base;
  return {
    enabled: partial.enabled ?? base.enabled,
    soundEnabled: partial.soundEnabled ?? base.soundEnabled,
    desktopEnabled: partial.desktopEnabled ?? base.desktopEnabled,
    durationSec: partial.durationSec ?? base.durationSec,
    events: applyLegacyTicketReasonIntent(
      { ...base.events, ...partial.events },
      partial.events
    ),
    tripIds: partial.tripIds === undefined ? base.tripIds : partial.tripIds,
    ledgerIds:
      partial.ledgerIds === undefined ? base.ledgerIds : partial.ledgerIds,
    mariTicketScopes: {
      ...base.mariTicketScopes,
      ...(partial.mariTicketScopes || {}),
    },
    quietHours: { ...base.quietHours, ...(partial.quietHours || {}) },
  };
}

export function isReasonEnabled(
  prefs: UserNotificationPrefs,
  reason: NotifyReason
): boolean {
  if (!prefs.enabled) return false;
  const v = prefs.events[reason];
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
