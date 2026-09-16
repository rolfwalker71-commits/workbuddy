"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";
import { useNotificationCenter } from "@/components/notifications/notification-center-provider";

export function NotificationBell({ className }: { className?: string }) {
  const t = useT();
  const { unread, openCenter } = useNotificationCenter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("relative", className)}
      onClick={openCenter}
      aria-label={
        unread > 0
          ? t("notifications.openWithCount", { count: unread })
          : t("notifications.open")
      }
      title={t("notifications.title")}
    >
      <Bell className="size-5" strokeWidth={APP_ICON_STROKE} />
      {unread > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[0.625rem] font-semibold tabular-nums text-white ring-2 ring-background"
          aria-hidden
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Button>
  );
}
