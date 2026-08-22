import { publishRealtime, type AppNotifyPayload } from "@/lib/realtime/hub";
import { isLiveNotificationsEnabled } from "@/lib/realtime/prefs";

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

/** Publish a live toast notification (clients filter by their prefs). */
export function notifyAppChange(
  input: Omit<AppNotifyPayload, "detail"> & { detail?: string | null }
): void {
  if (!isLiveNotificationsEnabled()) return;

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

  publishRealtime({ topic: "notify", at, notification });

  if (!notification.skipWebPush) {
    void import("@/lib/push/dispatch")
      .then((m) => m.dispatchWebPush(notification))
      .catch(() => {
        /* optional */
      });
  }
}
