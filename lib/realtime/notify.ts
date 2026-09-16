import { publishRealtime, type AppNotifyPayload } from "@/lib/realtime/hub";
import { isLiveNotificationsEnabled } from "@/lib/realtime/prefs";
import { recordNotification } from "@/lib/notifications/store";

export {
  isLiveNotificationsEnabled,
  setLiveNotificationsEnabled,
  getLiveNotificationsDurationSec,
  setLiveNotificationsDurationSec,
  isLiveNotificationsSoundEnabled,
  setLiveNotificationsSoundEnabled,
  LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
  LIVE_NOTIFICATIONS_MIN_DURATION_SEC,
  LIVE_NOTIFICATIONS_MAX_DURATION_SEC,
} from "@/lib/realtime/prefs";

function clip(raw: string | null | undefined, max: number): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Publish a notification: record it, then toast it and push it.
 *
 * The single choke point for every emitter, so recording here is what gives
 * the ticket sync, the evening digest and the analyse routes a visible history
 * without touching any of them.
 */
export function notifyAppChange(
  input: Omit<AppNotifyPayload, "detail"> & { detail?: string | null }
): void {
  const at = new Date().toISOString();
  const notification: AppNotifyPayload = {
    ...input,
    detail: clip(input.detail ?? null, 160),
    title: input.title ?? null,
    href: input.href ?? null,
    aiIconUrl: input.aiIconUrl ?? null,
    category: input.category ?? null,
    meta: input.meta ?? null,
  };

  // Deliberately before the live-notifications gate: muting is about toasts and
  // push noise, not about losing the record. `recordNotification` swallows its
  // own errors so a storage problem can never silence a notification.
  if (!notification.skipHistory) {
    recordNotification(notification, at);
  }

  if (!isLiveNotificationsEnabled()) return;

  publishRealtime({ topic: "notify", at, notification });

  if (!notification.skipWebPush) {
    void import("@/lib/push/dispatch")
      .then((m) => m.dispatchWebPush(notification))
      .catch(() => {
        /* optional */
      });
  }
}
