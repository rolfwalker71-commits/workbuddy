"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PresenceStatusPills } from "@/components/presence/presence-status-pills";
import { cn } from "@/lib/utils";
import {
  canOverridePerson,
  organizationLabel,
  type PresencePersonView,
} from "@/lib/presence/client";
import type { UserOrganization } from "@/lib/users/organization";
import type { PresenceStatus } from "@/lib/presence/status";
import { formatSwissDate } from "@/lib/utils/dates";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { presenceDisplayLabel } from "@/lib/i18n/display";

export function PresenceDelegateDialog({
  open,
  onOpenChange,
  people,
  actor,
  selfUserId,
  ymd,
  initialUserId,
  busy,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: PresencePersonView[];
  actor: {
    isAdmin: boolean;
    canManagePresence: boolean;
    organization: UserOrganization | null;
  };
  selfUserId: number | null;
  ymd: string;
  initialUserId?: number | null;
  busy?: boolean;
  error?: string | null;
  onSave: (input: { userId: number; status: PresenceStatus }) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const candidates = useMemo(
    () =>
      people.filter(
        (person) =>
          person.userId !== selfUserId && canOverridePerson(actor, person)
      ),
    [actor, people, selfUserId]
  );
  const [userId, setUserId] = useState<number | null>(initialUserId ?? null);
  const [status, setStatus] = useState<PresenceStatus | null>(null);

  const selected =
    candidates.find((person) => person.userId === userId) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setUserId(initialUserId ?? null);
          const pre =
            candidates.find((person) => person.userId === initialUserId) ??
            null;
          setStatus(pre?.status ?? null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("presence.setForColleague")}</DialogTitle>
          <DialogDescription>
            {t("presence.forColleagueHint", { date: formatSwissDate(ymd) })}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("presence.nobodyDelegate")}
          </p>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-2">
              {candidates.map((person) => {
                const active = person.userId === userId;
                return (
                  <li key={person.userId}>
                    <button
                      type="button"
                      onClick={() => {
                        setUserId(person.userId);
                        setStatus(person.status);
                      }}
                      className={cn(
                        "flex w-full min-h-11 items-start justify-between gap-2 rounded-2xl bg-card px-3 py-2.5 text-left shadow-sm ring-1 ring-foreground/10",
                        active && "ring-2 ring-primary"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-semibold leading-snug">
                          {person.displayName}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {organizationLabel(person.organization, locale)}
                          {person.status
                            ? ` · ${presenceDisplayLabel(person.status, locale)}`
                            : ` · ${t("presence.open")}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <PresenceStatusPills
              value={status}
              onChange={setStatus}
              disabled={busy || !selected}
              ariaLabel={t("presence.statusForColleague")}
            />
            <Button
              type="button"
              className="h-11 w-full"
              disabled={busy || !selected || !status}
              onClick={() => {
                if (!selected || !status) return;
                onSave({ userId: selected.userId, status });
              }}
            >
              {t("common.save")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
