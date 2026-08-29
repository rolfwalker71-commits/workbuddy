"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useTheme } from "@/components/theme/theme-provider";
import { useT } from "@/components/i18n/locale-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const t = useT();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={isDark ? t("theme.light") : t("theme.dark")}
      aria-label={
        isDark ? t("theme.activateLight") : t("theme.activateDark")
      }
      className={cn(
        "size-8 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className
      )}
    >
      {isDark ? (
        <Sun className="size-4" strokeWidth={APP_ICON_STROKE} aria-hidden />
      ) : (
        <Moon className="size-4" strokeWidth={APP_ICON_STROKE} aria-hidden />
      )}
    </Button>
  );
}
