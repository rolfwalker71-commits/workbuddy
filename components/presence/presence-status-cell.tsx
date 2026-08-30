"use client";

import { PresenceStatusGlyph } from "@/components/presence/presence-status-glyph";
import { cn } from "@/lib/utils";
import { PRESENCE_STATUS_SURFACE } from "@/lib/presence/client";
import type { PresenceStatus } from "@/lib/presence/status";

export function PresenceStatusCell({
  status,
  label,
  hint,
  spoken,
  isToday,
  interactive,
  onClick,
}: {
  status: PresenceStatus | null | undefined;
  label: string;
  hint?: string | null;
  spoken: string;
  isToday?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "flex min-h-11 w-full min-w-0 flex-col items-start justify-center gap-0.5 rounded-xl px-1.5 py-1.5 text-left ring-1",
    PRESENCE_STATUS_SURFACE[status ?? "unset"],
    isToday && "ring-2 ring-primary/70",
    interactive && "transition-shadow hover:shadow-md"
  );

  const inner = (
    <>
      <span className="inline-flex min-w-0 items-start gap-1">
        <PresenceStatusGlyph status={status} className="mt-0.5" />
        <span className="min-w-0 break-words text-xs font-semibold leading-snug">
          {label}
        </span>
      </span>
      {hint ? (
        <span className="break-words text-[0.65rem] leading-snug opacity-80">
          {hint}
        </span>
      ) : null}
    </>
  );

  if (interactive && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={spoken}
        title={spoken}
        aria-current={isToday ? "date" : undefined}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={className} aria-label={spoken} title={spoken}>
      {inner}
    </div>
  );
}
