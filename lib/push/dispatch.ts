import webpush from "web-push";
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import {
  deletePushSubscriptionRow,
  listAllPushSubscriptions,
  type PushSubscriptionRow,
} from "@/lib/push/subscriptions";
import { ensureWebPushConfigured } from "@/lib/push/vapid";
import { ownerMayReceive } from "@/lib/push/owner-filter";
import {
  getNotificationPrefsForOwnerKey,
  isReasonEnabled,
} from "@/lib/realtime/prefs";

export { ownerMayReceive } from "@/lib/push/owner-filter";

export function subscriptionMayReceivePush(
  ownerKey: string,
  notification: AppNotifyPayload
): boolean {
  if (!ownerMayReceive(ownerKey, notification)) return false;
  const prefs = getNotificationPrefsForOwnerKey(ownerKey);
  return isReasonEnabled(prefs, notification.reason);
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
  await Promise.all(
    rows
      .filter((row) => subscriptionMayReceivePush(row.owner_key, notification))
      .map((row) => sendOne(row, payload))
  );
}
