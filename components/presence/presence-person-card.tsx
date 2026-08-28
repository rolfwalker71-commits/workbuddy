"use client";

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
  const surface = PRESENCE_STATUS_SURFACE[person.status ?? "unset"];
  const statusLabel = person.status
    ? PRESENCE_STATUS_LABELS[person.status]
    : "Offen";
  const className = cn(
    "relative flex w-full min-h-11 flex-col items-start gap-1 overflow-hidden rounded-2xl px-3 py-2.5 text-left shadow-sm ring-1",
    surface,
    isSelf && "ring-2 ring-primary/70",
    interactive && "transition-shadow hover:shadow-md"
  );

  const body = (
    <>
      <PresenceIsoArt status={person.status} variant="watermark" />
      <span className="relative z-10 break-words pr-10 text-sm font-semibold leading-snug">
        {person.displayName}
        {isSelf ? " · Du" : ""}
      </span>
      <span className="relative z-10 pr-10 text-xs leading-snug">
        {statusLabel}
        {hint ? ` · ${hint}` : ""}
      </span>
      <span className="relative z-10 pr-10 text-[0.7rem] leading-snug text-current/70">
        {organizationLabel(person.organization)}
      </span>
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
