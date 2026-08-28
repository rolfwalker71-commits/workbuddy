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
  disabled,
  ariaLabel = "Anwesenheit",
}: {
  value: PresenceStatus | null;
  onChange: (status: PresenceStatus) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn(segmentedTrackClass, "w-full max-w-full flex-nowrap")}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {PRESENCE_STATUSES.map((status) => {
        const Icon = PILL_ICONS[status];
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            {...segmentedTriggerProps}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              segmentedTriggerClass(active),
              "text-[0.7rem] sm:text-sm",
              active && PRESENCE_STATUS_ACTIVE_PILL[status]
            )}
            onClick={() => onChange(status)}
          >
            <Icon
              className="size-4 shrink-0"
              strokeWidth={APP_ICON_STROKE}
              aria-hidden
            />
            <span className="break-words leading-none">
              {PRESENCE_PILL_LABELS[status]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
