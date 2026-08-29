"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
  segmentedTriggerProps,
} from "@/components/layout/segmented-control";
import { LOCALE_SHORT_LABEL, type Locale } from "@/lib/i18n";
import { useLocale } from "./locale-provider";

export function LocaleSwitcher({
  className,
  variant = "segmented",
}: {
  className?: string;
  variant?: "segmented" | "compact";
}) {
  const { locale, locales, setLocale, t } = useLocale();

  if (variant === "compact") {
    const next: Locale = locale === "de" ? "en" : "de";
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setLocale(next)}
        title={t("common.language")}
        aria-label={`${t("common.language")}: ${LOCALE_SHORT_LABEL[locale]}`}
        className={cn(
          "size-8 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          className
        )}
      >
        <Languages className="size-4" aria-hidden />
        <span className="sr-only">{LOCALE_SHORT_LABEL[next]}</span>
      </Button>
    );
  }

  return (
    <div
      className={cn(segmentedTrackClass, className)}
      role="group"
      aria-label={t("common.language")}
    >
      {locales.map((code) => {
        const active = code === locale;
        return (
          <Button
            key={code}
            type="button"
            variant="ghost"
            {...segmentedTriggerProps}
            aria-pressed={active}
            onClick={() => {
              if (!active) setLocale(code);
            }}
            className={segmentedTriggerClass(active)}
          >
            {LOCALE_SHORT_LABEL[code]}
          </Button>
        );
      })}
    </div>
  );
}
