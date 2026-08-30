"use client";

import {
  Building2,
  CircleDashed,
  House,
  Palmtree,
  Thermometer,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { PresenceStatus } from "@/lib/presence/status";
import { cn } from "@/lib/utils";

export const PRESENCE_STATUS_ICONS: Record<
  PresenceStatus | "unset",
  LucideIcon
> = {
  office: Building2,
  home: House,
  sick: Thermometer,
  vacation: Palmtree,
  absent: UserRoundX,
  unset: CircleDashed,
};

export function PresenceStatusGlyph({
  status,
  className,
}: {
  status: PresenceStatus | null | undefined;
  className?: string;
}) {
  const Icon = PRESENCE_STATUS_ICONS[status ?? "unset"];
  return (
    <Icon
      className={cn("size-4 shrink-0", className)}
      strokeWidth={APP_ICON_STROKE}
      aria-hidden
    />
  );
}
