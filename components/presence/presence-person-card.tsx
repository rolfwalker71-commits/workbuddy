"use client";

import { OrganizationWithFlag } from "@/components/branding/country-flag";
import { PresenceStatusGlyph } from "@/components/presence/presence-status-glyph";
import { cn } from "@/lib/utils";
import {
  organizationLabel,
  presenceSourceHint,
  PRESENCE_STATUS_SURFACE,
  type PresencePersonView,
} from "@/lib/presence/client";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { presenceDisplayLabel } from "@/lib/i18n/display";

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
    "flex min-h-11 w-full min-w-0 flex-col items-stretch gap-1 rounded-2xl px-3 py-2.5 text-left shadow-sm ring-1",
    PRESENCE_STATUS_SURFACE[person.status ?? "unset"],
    isSelf && "ring-2 ring-primary/70",
    interactive && "transition-shadow hover:shadow-md"
  );

  const body = (
    <>
      <span className="inline-flex min-w-0 items-start gap-1.5">
        <PresenceStatusGlyph status={person.status} className="mt-0.5" />
        <span className="min-w-0 break-words text-base font-semibold leading-snug">
          {person.displayName}
          {isSelf ? t("presence.youSuffix") : ""}
        </span>
      </span>
      <span className="break-words text-xs leading-snug">
        {statusLabel}
        {hint ? ` · ${hint}` : ""}
      </span>
      {orgLabel ? (
        <span className="break-words text-[0.7rem] leading-snug opacity-80">
          <OrganizationWithFlag
            organization={person.organization}
            label={orgLabel}
            locale={locale}
          />
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
