"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSwissDate } from "@/lib/utils/dates";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";
import { notifyReasonDisplayLabel } from "@/lib/i18n/display";
import type { NotifyReason } from "@/lib/realtime/hub";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { useNotificationCenter } from "@/components/notifications/notification-center-provider";

export type NotificationItem = {
  id: number;
  domain: string;
  reason: string;
  headline: string;
  title: string | null;
  detail: string | null;
  href: string | null;
  category: string | null;
  source: string;
  createdAt: string;
  readAt: string | null;
  ymd: string;
  timeHm: string;
};

function groupByDay(items: NotificationItem[]): Array<{
  ymd: string;
  items: NotificationItem[];
}> {
  const out: Array<{ ymd: string; items: NotificationItem[] }> = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.ymd === item.ymd) last.items.push(item);
    else out.push({ ymd: item.ymd, items: [item] });
  }
  return out;
}

export function NotificationList({
  pageSize = 30,
  onNavigate,
}: {
  pageSize?: number;
  /** Wird vor dem Navigieren aufgerufen — das Sheet schliesst sich damit. */
  onNavigate?: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { setUnread, refreshUnread } = useNotificationCenter();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (before?: string | null) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (before) params.set("before", before);
      const res = await fetch(`/api/me/notifications?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as {
        items: NotificationItem[];
        hasMore: boolean;
        unread: number;
      };
    },
    [pageSize]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await load();
        if (cancelled) return;
        setItems(data.items);
        setHasMore(data.hasMore);
        setUnread(data.unread);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, setUnread]);

  async function loadMore() {
    const oldest = items[items.length - 1];
    if (!oldest || busy) return;
    setBusy(true);
    try {
      const data = await load(oldest.createdAt);
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function markRead(ids: number[]) {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    // Optimistisch: der Haken soll sofort sitzen, der Zähler folgt vom Server.
    setItems((prev) =>
      prev.map((item) =>
        ids.includes(item.id) && !item.readAt ? { ...item, readAt: now } : item
      )
    );
    try {
      const res = await fetch("/api/me/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const data = (await res.json()) as { unread?: number };
        if (typeof data.unread === "number") setUnread(data.unread);
        return;
      }
    } catch {
      /* fällt unten auf den Server-Stand zurück */
    }
    refreshUnread();
  }

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => (item.readAt ? item : { ...item, readAt: now }))
    );
    try {
      const res = await fetch("/api/me/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as { unread?: number };
        if (typeof data.unread === "number") setUnread(data.unread);
      } else {
        refreshUnread();
      }
    } catch {
      refreshUnread();
    } finally {
      setBusy(false);
    }
  }

  const today = zurichYmd();
  const yesterday = addDaysYmd(today, -1);
  const groups = useMemo(() => groupByDay(items), [items]);
  const unreadHere = items.filter((item) => !item.readAt).length;

  function dayLabel(ymd: string): string {
    if (ymd === today) return t("notifications.today");
    if (ymd === yesterday) return t("notifications.yesterday");
    return formatSwissDate(ymd);
  }

  if (loading) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {t("common.loading")}
      </p>
    );
  }

  if (failed && items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {t("errors.loadFailed")}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-medium">{t("notifications.empty")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("notifications.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 px-4">
        <p className="text-xs text-muted-foreground tabular-nums">
          {unreadHere > 0
            ? t("notifications.unreadCount", { count: unreadHere })
            : t("notifications.allRead")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={busy || unreadHere === 0}
        >
          {t("notifications.markAllRead")}
        </Button>
      </div>

      {groups.map((group) => (
        <section key={group.ymd} className="space-y-1">
          <h3 className="px-4 text-xs font-semibold text-muted-foreground">
            {dayLabel(group.ymd)}
          </h3>
          <ul>
            {group.items.map((item) => {
              const unread = !item.readAt;
              const reasonLabel = notifyReasonDisplayLabel(
                item.reason as NotifyReason,
                locale
              );
              const body = (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                      {reasonLabel}
                    </span>
                    <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">
                      {item.timeHm}
                    </span>
                  </span>
                  <span className="mt-0.5 block break-words text-sm font-medium leading-snug">
                    {item.headline}
                  </span>
                  {item.detail ? (
                    <span className="mt-0.5 block break-words text-xs leading-snug text-muted-foreground">
                      {item.detail}
                    </span>
                  ) : null}
                </>
              );
              const rowClass = cn(
                "flex min-h-11 w-full flex-col border-l-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/60",
                unread
                  ? "border-l-orange-500 bg-muted/40"
                  : "border-l-transparent"
              );

              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={rowClass}
                      onClick={() => {
                        void markRead([item.id]);
                        onNavigate?.();
                      }}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() => void markRead([item.id])}
                      aria-label={
                        unread ? t("notifications.markRead") : undefined
                      }
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {hasMore ? (
        <div className="px-4 pb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={loadMore}
            disabled={busy}
          >
            {t("notifications.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
