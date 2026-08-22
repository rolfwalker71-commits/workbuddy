import webpush from "web-push";
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { parseOwnerKey } from "@/lib/auth/owner-key";
import {
  deletePushSubscriptionRow,
  listAllPushSubscriptions,
  type PushSubscriptionRow,
} from "@/lib/push/subscriptions";
import { ensureWebPushConfigured } from "@/lib/push/vapid";

function ownerMayReceive(
  ownerKey: string,
  notification: AppNotifyPayload
): boolean {
  const parsed = parseOwnerKey(ownerKey);
  if (!parsed) return false;
  if (parsed.kind === "admin") return true;
  if (notification.ownerUserId != null) {
    return parsed.userId === notification.ownerUserId;
  }
  return true;
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
    ensureWebPushConfigured();
  } catch {
    return;
  }
  const payload = JSON.stringify({
    title: notification.headline,
    body: notification.detail || notification.title || "",
    url: notification.href || "/microsoft",
    badge: "/icon-192.png",
  });
  const rows = listAllPushSubscriptions();
  await Promise.all(
    rows
      .filter((row) => ownerMayReceive(row.owner_key, notification))
      .map((row) => sendOne(row, payload))
  );
}
