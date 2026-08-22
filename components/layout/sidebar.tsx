"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import {
  MaringoLogo,
  MicrosoftLogo,
} from "@/components/branding/provider-logos";
import { UserAvatar } from "@/components/users/user-avatar";
import { APP_VERSION } from "@/lib/app-version";
import { BuddyLogo } from "@/components/brand/buddy-logo";
import { WorkBuddyWordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

const SIDEBAR_COLLAPSED_KEY = "workbuddy.sidebar.collapsed";

type NavItem = {
  href: string;
  label: string;
  module?: "microsoft" | "maringo";
  adminOnly?: boolean;
  logo?: React.ReactNode;
  icon?: React.ReactNode;
};

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Übersicht",
    icon: <LayoutDashboard className="size-4" strokeWidth={APP_ICON_STROKE} />,
  },
  {
    href: "/microsoft",
    label: "Microsoft 365",
    module: "microsoft",
    logo: <MicrosoftLogo className="size-4" />,
  },
  {
    href: "/maringo",
    label: "Maringo Support",
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
    label: "Einstellungen",
    adminOnly: true,
    icon: <Settings className="size-4" strokeWidth={APP_ICON_STROKE} />,
  },
];

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { me } = useAuth();
  const isLimitedUser = me != null && !me.isAdmin;
  const [collapsedPref, setCollapsedPref] = useState(false);
  const collapsed = Boolean(collapsedPref && !onNavigate);

  useEffect(() => {
    try {
      setCollapsedPref(
        window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
      );
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsedPref((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const modules = me?.modules ?? [];
  const items = NAV.filter((item) => {
    if (item.adminOnly) return Boolean(me?.isAdmin);
    if (item.module && isLimitedUser) return modules.includes(item.module);
    return true;
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-[4.25rem]" : "w-60",
        className
      )}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <ThemeToggle
        className={cn(
          "absolute z-10",
          collapsed ? "top-3 left-2.5" : "top-3.5 left-3.5"
        )}
      />
      {!onNavigate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          title={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
          className={cn(
            "absolute z-10 size-8 text-sidebar-foreground/80 hover:bg-sidebar-accent",
            collapsed ? "top-3 right-2.5" : "top-3.5 right-3.5"
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <ChevronsLeft className="size-4" />
          )}
        </Button>
      ) : null}

      <div className={cn(collapsed ? "px-2 py-4 pt-11" : "px-5 py-6 pr-12 pt-11")}>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-auto w-full whitespace-normal px-0 py-0 text-left hover:bg-transparent",
            collapsed ? "justify-center" : "justify-start gap-3"
          )}
          onClick={() => {
            router.push("/");
            onNavigate?.();
          }}
        >
          <BuddyLogo
            size={collapsed ? 40 : 56}
            className={collapsed ? "h-10 w-10" : "h-14 w-14"}
            priority
          />
          {!collapsed ? <WorkBuddyWordmark /> : null}
        </Button>
        {me ? (
          <div
            className={cn(
              "mt-4 flex items-center rounded-xl bg-black/5 dark:bg-white/5",
              collapsed ? "justify-center px-1.5 py-2" : "gap-2.5 px-3 py-2.5"
            )}
          >
            <UserAvatar name={me.displayName} src={me.avatarUrl} size={collapsed ? "sm" : "md"} />
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="text-[0.7rem] font-medium leading-none text-sidebar-foreground/65">
                  Angemeldet als
                </p>
                <p className="mt-1.5 truncate text-sm font-semibold tracking-tight">
                  {me.displayName}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <nav className={cn("min-h-0 flex-1 space-y-1 overflow-y-auto pb-3", collapsed ? "px-1.5" : "px-3")}>
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center rounded-xl text-sm font-medium",
                collapsed ? "justify-center px-2" : "gap-3 px-3",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70"
              )}
            >
              {item.logo || item.icon}
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className={cn("space-y-2 pb-4", collapsed ? "px-1.5" : "px-3")}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void logout()}
          className={cn(
            "h-11 w-full text-sidebar-foreground/80",
            collapsed ? "justify-center px-2" : "justify-start gap-3"
          )}
        >
          <LogOut className="size-4" />
          {!collapsed ? "Abmelden" : null}
        </Button>
        {!collapsed ? (
          <p className="px-2 text-[0.7rem] text-sidebar-foreground/50">
            {APP_VERSION}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
