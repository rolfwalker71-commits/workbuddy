"use client";

import { PresenceStatusGlyph } from "@/components/presence/presence-status-glyph";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import { PRESENCE_STATUS_SURFACE } from "@/lib/presence/client";
import { PRESENCE_STATUSES } from "@/lib/presence/status";
import { presenceDisplayLabel } from "@/lib/i18n/display";

const LEGEND_KEYS = [...PRESENCE_STATUSES, null] as const;

export function PresenceStatusLegend() {
  const t = useT();
  const { locale } = useLocale();

  return (
    <ul
      className="flex flex-wrap gap-1.5"
      aria-label={t("presence.legend")}
    >
      {LEGEND_KEYS.map((status) => {
        const key = status ?? "open";
        const label = status
          ? presenceDisplayLabel(status, locale, "pill")
          : t("presence.open");
        return (
          <li
            key={key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 ring-1",
              PRESENCE_STATUS_SURFACE[status ?? "unset"]
            )}
          >
            <PresenceStatusGlyph status={status} />
            <span className="break-words text-xs font-medium leading-snug">
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
