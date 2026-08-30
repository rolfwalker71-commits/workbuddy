"use client";

import { PresenceStatusGlyph } from "@/components/presence/presence-status-glyph";
import { cn } from "@/lib/utils";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
  segmentedTriggerProps,
} from "@/components/layout/segmented-control";
import { PRESENCE_STATUS_ACTIVE_PILL } from "@/lib/presence/client";
import {
  PRESENCE_STATUSES,
  type PresenceStatus,
} from "@/lib/presence/status";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { presenceDisplayLabel } from "@/lib/i18n/display";

export function PresenceStatusPills({
  value,
  onChange,
  onClear,
  disabled,
  ariaLabel,
}: {
  value: PresenceStatus | null;
  onChange: (status: PresenceStatus) => void;
  onClear?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <div
      className={cn(segmentedTrackClass, "w-full min-w-0 max-w-full flex-nowrap")}
      role="radiogroup"
      aria-label={ariaLabel ?? t("presence.attendance")}
    >
      {PRESENCE_STATUSES.map((status) => {
        const active = value === status;
        const label = presenceDisplayLabel(status, locale, "pill");
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={label}
            {...segmentedTriggerProps}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              segmentedTriggerClass(active),
              "gap-1 px-1.5 text-[0.7rem] sm:gap-1.5 sm:px-2 sm:text-sm",
              active && PRESENCE_STATUS_ACTIVE_PILL[status]
            )}
            onClick={() => {
              if (active && onClear) onClear();
              else onChange(status);
            }}
          >
            <PresenceStatusGlyph status={status} />
            <span className="min-w-0 truncate leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
