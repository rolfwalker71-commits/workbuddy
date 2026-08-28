"use client";

import { PresenceGlassPanel } from "@/components/presence/presence-glass-panel";
import { PresenceIsoArt } from "@/components/presence/presence-iso-art";
import { cn } from "@/lib/utils";
import {
  organizationLabel,
  presenceSourceHint,
  PRESENCE_STATUS_LABELS,
  PRESENCE_STATUS_SURFACE,
  type PresencePersonView,
} from "@/lib/presence/client";

export function PresencePersonCard({
  person,
  isSelf,
  interactive,
  onClick,
}: {
  person: PresencePersonView;
  isSelf?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const hint = presenceSourceHint(person.source);
  const statusLabel = person.status
    ? PRESENCE_STATUS_LABELS[person.status]
    : "Offen";
  const hasArt = Boolean(person.status);
  const className = cn(
    "relative flex w-full flex-col items-stretch overflow-hidden rounded-2xl text-left shadow-sm ring-1",
    hasArt
      ? "bg-zinc-200 ring-foreground/10 dark:bg-zinc-900"
      : PRESENCE_STATUS_SURFACE.unset,
    isSelf && "ring-2 ring-primary/70",
    interactive && "transition-shadow hover:shadow-md"
  );

  const copy = (
    <>
      <span className="break-words text-sm font-semibold leading-snug">
        {person.displayName}
        {isSelf ? " · Du" : ""}
      </span>
      <span className="text-xs leading-snug">
        {statusLabel}
        {hint ? ` · ${hint}` : ""}
      </span>
      <span className="text-[0.7rem] leading-snug text-muted-foreground">
        {organizationLabel(person.organization)}
      </span>
    </>
  );

  const body = (
    <>
      {hasArt ? <PresenceIsoArt status={person.status} variant="hero" /> : null}
      <div
        className={cn(
          "relative z-10 flex",
          hasArt
            ? "min-h-[7.25rem] items-end p-2 sm:items-center"
            : "min-h-11 flex-col items-start gap-1 px-3 py-2.5"
        )}
      >
        {hasArt ? (
          <PresenceGlassPanel className="flex w-[min(16.5rem,calc(100%-2.75rem))] flex-col gap-0.5 p-2.5">
            {copy}
          </PresenceGlassPanel>
        ) : (
          copy
        )}
      </div>
    </>
  );

  if (interactive && onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
