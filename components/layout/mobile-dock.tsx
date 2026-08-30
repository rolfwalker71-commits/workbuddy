"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScrollText,
  Settings,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import {
  GoogleLogo,
  MaringoLogo,
  MicrosoftLogo,
} from "@/components/branding/provider-logos";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

type DockItem = {
  href: string;
  labelKey: MessageKey;
  module?: "microsoft" | "maringo" | "google";
  adminOnly?: boolean;
  logo?: React.ReactNode;
  icon?: React.ReactNode;
};

export function MobileDock() {
  const pathname = usePathname() || "/";
  const { me } = useAuth();
  const t = useT();
  const modules = me?.modules ?? [];
  const isAdmin = Boolean(me?.isAdmin);

  const allItems: DockItem[] = [
    {
      href: "/",
      labelKey: "nav.overview",
      icon: <LayoutDashboard className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
    {
      href: "/team",
      labelKey: "nav.team",
      icon: <Users className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
    {
      href: "/technik",
      labelKey: "nav.technikShort",
      icon: <Wrench className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
    {
      href: "/microsoft",
      labelKey: "nav.microsoftShort",
      module: "microsoft",
      logo: <MicrosoftLogo className="size-4" />,
    },
    {
      href: "/google",
      labelKey: "nav.googleShort",
      module: "google",
      logo: <GoogleLogo className="size-4" />,
    },
    {
      href: "/maringo",
      labelKey: "nav.maringoShort",
      module: "maringo",
      logo: <MaringoLogo className="size-4" />,
    },
    {
      href: "/account",
      labelKey: "nav.account",
      icon: <UserRound className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
    {
      href: "/activity",
      labelKey: "nav.activity",
      adminOnly: true,
      icon: <ScrollText className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
    {
      href: "/settings",
      labelKey: "nav.settings",
      adminOnly: true,
      icon: <Settings className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
  ];
  const items = allItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.module && !isAdmin) return modules.includes(item.module);
    return true;
  });

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden"
      aria-label={t("common.mainNav")}
    >
      <div
        className="pointer-events-auto mx-auto max-w-lg px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-around gap-1 rounded-2xl bg-card p-1 shadow-lg ring-1 ring-foreground/10">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.7rem] font-medium leading-none",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {item.logo || item.icon}
                <span className="break-words text-center leading-snug">
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
