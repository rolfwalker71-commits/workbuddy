import webpush from "web-push";
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import {
  deletePushSubscriptionRow,
  listAllPushSubscriptions,
  type PushSubscriptionRow,
} from "@/lib/push/subscriptions";
import { ensureWebPushConfigured } from "@/lib/push/vapid";
import { ownerMayReceive } from "@/lib/push/owner-filter";
import { parseOwnerKey } from "@/lib/auth/owner-key";
import {
  getNotificationPrefsForOwnerKey,
  isReasonEnabled,
} from "@/lib/realtime/prefs";
import { quietHoursSuppressesForUser } from "@/lib/notifications/quiet-hours";
import { getUserDayStatus } from "@/lib/presence/day-status";
import type { PresenceStatus } from "@/lib/presence/status";
import { zurichYmd } from "@/lib/microsoft/time";

export { ownerMayReceive } from "@/lib/push/owner-filter";

export type PresenceLookup = (userId: number) => PresenceStatus | null;

/** Eine Präsenzabfrage je Benutzer und Versand, nicht je Gerät. */
export function createPresenceLookup(now = new Date()): PresenceLookup {
  const ymd = zurichYmd(now);
  const cache = new Map<number, PresenceStatus | null>();
  return (userId) => {
    if (cache.has(userId)) return cache.get(userId) ?? null;
    let status: PresenceStatus | null = null;
    try {
      status = getUserDayStatus(userId, ymd)?.status ?? null;
    } catch {
      status = null;
    }
    cache.set(userId, status);
    return status;
  };
}

export function subscriptionMayReceivePush(
  ownerKey: string,
  notification: AppNotifyPayload,
  options?: { presenceLookup?: PresenceLookup; now?: Date }
): boolean {
  if (!ownerMayReceive(ownerKey, notification)) return false;
  const prefs = getNotificationPrefsForOwnerKey(ownerKey);
  if (!isReasonEnabled(prefs, notification.reason)) return false;

  // Ruhezeiten treffen nur das Gerät — Historie und In-App-Toast bleiben.
  const parsed = parseOwnerKey(ownerKey);
  const lookup = options?.presenceLookup ?? createPresenceLookup(options?.now);
  return !quietHoursSuppressesForUser({
    reason: notification.reason,
    window: prefs.quietHours,
    userId: parsed?.kind === "user" ? parsed.userId : null,
    presenceLookup: lookup,
    now: options?.now,
  });
}

async function sendOne(
  row: PushSubscriptionRow,
  payload: string
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      payload
    );
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      deletePushSubscriptionRow(row.id);
    }
  }
}

export async function dispatchWebPush(notification: AppNotifyPayload): Promise<void> {
  try {
    if (!ensureWebPushConfigured()) return;
  } catch {
    return;
  }
  const payload = JSON.stringify({
    title: notification.headline,
    body: notification.detail || notification.title || "",
    url: notification.href || "/",
    badge: "/icon-192.png",
  });
  const rows = listAllPushSubscriptions();
  const presenceLookup = createPresenceLookup();
  await Promise.all(
    rows
      .filter((row) =>
        subscriptionMayReceivePush(row.owner_key, notification, {
          presenceLookup,
        })
      )
      .map((row) => sendOne(row, payload))
  );
}
