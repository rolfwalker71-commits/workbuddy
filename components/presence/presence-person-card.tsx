"use client";

import { PresenceGlassPanel } from "@/components/presence/presence-glass-panel";
import { PresenceIsoArt } from "@/components/presence/presence-iso-art";
import { cn } from "@/lib/utils";
import {
  organizationLabel,
  presenceSourceHint,
  type PresencePersonView,
} from "@/lib/presence/client";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { presenceDisplayLabel } from "@/lib/i18n/display";

const CHIP_MAX = "w-fit max-w-[min(14rem,calc(100%-3rem))]";

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
  const t = useT();
  const { locale } = useLocale();
  const hint = presenceSourceHint(person.source, locale);
  const statusLabel = person.status
    ? presenceDisplayLabel(person.status, locale)
    : t("presence.open");
  const spokenStatus = person.status ? statusLabel : t("presence.unset");
  const orgLabel = organizationLabel(person.organization, locale);
  const spoken = `${person.displayName}${isSelf ? t("presence.youSuffix") : ""}: ${spokenStatus}${hint ? ` · ${hint}` : ""}`;
  const className = cn(
    "relative flex w-full flex-col items-stretch overflow-hidden rounded-2xl text-left shadow-sm ring-1",
    "bg-zinc-200 ring-foreground/10 dark:bg-zinc-900",
    isSelf && "ring-2 ring-primary/70",
    interactive && "transition-shadow hover:shadow-md"
  );

  const name = (
    <span className="break-words text-lg font-semibold leading-snug">
      {person.displayName}
      {isSelf ? t("presence.youSuffix") : ""}
    </span>
  );

  const rest = (
    <>
      <span className="text-xs leading-snug">
        {statusLabel}
        {hint ? ` · ${hint}` : ""}
      </span>
      {orgLabel ? (
        <span className="text-[0.7rem] leading-snug text-muted-foreground">
          {orgLabel}
        </span>
      ) : null}
    </>
  );

  const body = (
    <>
      <PresenceIsoArt status={person.status} variant="hero" />
      <div className="relative z-10 flex min-h-[7.25rem] flex-col justify-between p-2">
        <PresenceGlassPanel className={cn("self-start px-2.5 py-1.5", CHIP_MAX)}>
          {name}
        </PresenceGlassPanel>
        <PresenceGlassPanel
          className={cn(
            "flex flex-col gap-0.5 self-end px-2.5 py-1.5",
            CHIP_MAX
          )}
        >
          {rest}
        </PresenceGlassPanel>
      </div>
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
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} aria-label={spoken} title={spoken}>
      {body}
    </div>
  );
}
