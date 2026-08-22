/**
 * In-process pub/sub for live UI (single Node instance / Docker).
 */

export type NotifyDomain = "maringo" | "microsoft";

export type NotifyReason =
  | "mari_ticket_changed"
  | "mail_calendar_patch"
  | "microsoft_mail_day"
  | "app_status";

/** @deprecated use NotifyReason */
export type DocumentNotifyReason = NotifyReason;

export type AppNotifyPayload = {
  domain: NotifyDomain;
  reason: NotifyReason;
  headline: string;
  detail: string | null;
  title: string | null;
  href: string | null;
  aiIconUrl: string | null;
  category: string | null;
  meta: string | null;
  source: "workbuddy" | "maringo" | "microsoft";
  /** Only this app user (and admins) should toast this event. */
  ownerUserId?: number | null;
  ownerKey?: string | null;
  tripId?: number | null;
  ledgerId?: number | null;
  /** Legacy document fields (optional) */
  localId?: number | null;
  paperlessId?: number | null;
  /** When true, skip household Telegram (limited module users). */
  skipTelegram?: boolean;
  /** When true, skip web-push / external mail-style alerts. */
  skipWebPush?: boolean;
};

/** @deprecated use AppNotifyPayload */
export type DocumentNotifyPayload = AppNotifyPayload & {
  localId: number;
  paperlessId: number;
  correspondentName: string | null;
  documentTypeName: string | null;
  createdDate: string | null;
};

export type RealtimeEvent =
  | { topic: "inbox"; at: string }
  | { topic: "notify"; at: string; notification: AppNotifyPayload }
  /** @deprecated kept for older clients during deploy */
  | { topic: "document"; at: string; document: AppNotifyPayload };

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

export function publishRealtime(event: RealtimeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* ignore broken subscribers */
    }
  }
}

export function publishInboxRefresh(): void {
  publishRealtime({ topic: "inbox", at: new Date().toISOString() });
}

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
