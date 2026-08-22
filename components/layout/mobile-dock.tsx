"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import {
  MaringoLogo,
  MicrosoftLogo,
} from "@/components/branding/provider-logos";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

type DockItem = {
  href: string;
  label: string;
  module?: "microsoft" | "maringo";
  adminOnly?: boolean;
  logo?: React.ReactNode;
  icon?: React.ReactNode;
};

export function MobileDock() {
  const pathname = usePathname() || "/";
  const { me } = useAuth();
  const modules = me?.modules ?? [];
  const isAdmin = Boolean(me?.isAdmin);

  const allItems: DockItem[] = [
    {
      href: "/",
      label: "Übersicht",
      icon: <LayoutDashboard className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
    {
      href: "/microsoft",
      label: "Microsoft",
      module: "microsoft",
      logo: <MicrosoftLogo className="size-4" />,
    },
    {
      href: "/maringo",
      label: "Maringo",
      module: "maringo",
      logo: <MaringoLogo className="size-4" />,
    },
    {
      href: "/account",
      label: "Konto",
      icon: <UserRound className="size-4" strokeWidth={APP_ICON_STROKE} />,
    },
    {
      href: "/settings",
      label: "Settings",
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
      aria-label="Hauptnavigation"
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
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
