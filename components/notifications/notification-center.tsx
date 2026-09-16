"use client";

import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useT } from "@/components/i18n/locale-provider";
import { useNotificationCenter } from "@/components/notifications/notification-center-provider";
import { NotificationList } from "@/components/notifications/notification-list";

export function NotificationCenter() {
  const t = useT();
  const { open, closeCenter, unread } = useNotificationCenter();

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : closeCenter())}>
      <SheetContent side="right" className="w-[min(100%,26rem)] gap-0 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{t("notifications.title")}</SheetTitle>
          <SheetDescription className="sr-only">
            {unread > 0
              ? t("notifications.unreadCount", { count: unread })
              : t("notifications.allRead")}
          </SheetDescription>
        </SheetHeader>

        {/* Das Padding unten hält die letzte Zeile über dem Mobile-Dock frei. */}
        <div className="min-h-0 flex-1 overflow-y-auto py-3 pb-[max(5rem,env(safe-area-inset-bottom))]">
          <NotificationList pageSize={20} onNavigate={closeCenter} />
        </div>

        <div className="border-t px-4 py-3">
          <Link
            href="/notifications"
            className="text-sm font-medium underline underline-offset-4"
            onClick={closeCenter}
          >
            {t("notifications.showAll")}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
