"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PresenceStatusPills } from "@/components/presence/presence-status-pills";
import { type PresencePersonView } from "@/lib/presence/client";
import { formatSwissDate } from "@/lib/utils/dates";
import type { PresenceStatus } from "@/lib/presence/status";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { presenceDisplayLabel } from "@/lib/i18n/display";

export function PresenceSetDialog({
  open,
  onOpenChange,
  person,
  ymd,
  locked,
  lockedReason,
  busy,
  error,
  onSelect,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: PresencePersonView | null;
  ymd: string;
  locked?: boolean;
  lockedReason?: string | null;
  busy?: boolean;
  error?: string | null;
  onSelect: (status: PresenceStatus) => void;
  onClear?: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {person
              ? `${person.displayName} · ${formatSwissDate(ymd)}`
              : formatSwissDate(ymd)}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? lockedReason || t("presence.lockedDefault")
              : t("presence.howThisDay")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        <PresenceStatusPills
          value={person?.status ?? null}
          onChange={onSelect}
          disabled={busy || locked}
          ariaLabel={t("presence.ownStatus")}
        />
        {person?.status ? (
          <p className="text-xs text-muted-foreground">
            {person.source === "default"
              ? t("presence.currentStatusRule", {
                  status: presenceDisplayLabel(person.status, locale),
                })
              : t("presence.currentStatus", {
                  status: presenceDisplayLabel(person.status, locale),
                })}
          </p>
        ) : null}
        {onClear && !locked ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onClear}
          >
            {t("presence.useRule")}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
