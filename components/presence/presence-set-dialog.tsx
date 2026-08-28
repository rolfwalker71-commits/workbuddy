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
import {
  PRESENCE_STATUS_LABELS,
  type PresencePersonView,
} from "@/lib/presence/client";
import { formatSwissDate } from "@/lib/utils/dates";
import type { PresenceStatus } from "@/lib/presence/status";

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
              ? lockedReason ||
                "Dieser Tag wurde von einer Stellvertretung oder Outlook gesetzt."
              : "Wie arbeitest du an diesem Tag?"}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        <PresenceStatusPills
          value={person?.status ?? null}
          onChange={onSelect}
          disabled={busy || locked}
          ariaLabel="Eigener Status"
        />
        {person?.status ? (
          <p className="text-xs text-muted-foreground">
            Aktuell: {PRESENCE_STATUS_LABELS[person.status]}
            {person.source === "default" ? " · Regel" : ""}
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
            Regel verwenden
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
