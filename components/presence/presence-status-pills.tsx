"use client";

import {
  Building2,
  House,
  Palmtree,
  Thermometer,
  UserRoundX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
  segmentedTriggerProps,
} from "@/components/layout/segmented-control";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  PRESENCE_PILL_LABELS,
  PRESENCE_STATUS_ACTIVE_PILL,
} from "@/lib/presence/client";
import {
  PRESENCE_STATUSES,
  type PresenceStatus,
} from "@/lib/presence/status";

const PILL_ICONS = {
  office: Building2,
  home: House,
  sick: Thermometer,
  vacation: Palmtree,
  absent: UserRoundX,
} as const;

export function PresenceStatusPills({
  value,
  onChange,
  onClear,
  disabled,
  ariaLabel = "Anwesenheit",
}: {
  value: PresenceStatus | null;
  onChange: (status: PresenceStatus) => void;
  onClear?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn(segmentedTrackClass, "w-full min-w-0 max-w-full flex-nowrap")}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {PRESENCE_STATUSES.map((status) => {
        const Icon = PILL_ICONS[status];
        const active = value === status;
        const label = PRESENCE_PILL_LABELS[status];
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
            <Icon
              className="size-4 shrink-0"
              strokeWidth={APP_ICON_STROKE}
              aria-hidden
            />
            <span className="min-w-0 truncate leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
