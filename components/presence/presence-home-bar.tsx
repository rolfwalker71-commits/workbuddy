"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresenceStatusPills } from "@/components/presence/presence-status-pills";
import { PresenceStatusGlyph } from "@/components/presence/presence-status-glyph";
import { PresenceDelegateDialog } from "@/components/presence/presence-delegate-dialog";
import { segmentedTriggerProps } from "@/components/layout/segmented-control";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { HomeAbsenceState } from "@/lib/dashboard/home-surfaces-shared";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  applyLegacyAbsence,
  applyLegacyAbsenceSelf,
  canManageOthers,
  fetchPresenceToday,
  isOwnDayLocked,
  presenceCounts,
  presenceSourceHint,
  deleteOwnDayStatus,
  putDelegatedDayStatus,
  putOwnDayStatus,
  PRESENCE_STATUS_DOT,
  PRESENCE_STATUS_SURFACE,
  type PresenceTodayResponse,
} from "@/lib/presence/client";
import type { PresenceStatus } from "@/lib/presence/status";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { presenceDisplayLabel } from "@/lib/i18n/display";

function awayIdsFromAbsence(absence: HomeAbsenceState | null): number[] {
  if (!absence) return [];
  return absence.colleagues.map((c) => c.userId);
}

export function PresenceHomeBar({
  absence,
}: {
  absence: HomeAbsenceState | null;
}) {
  const { me } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const [data, setData] = useState<PresenceTodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateError, setDelegateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await fetchPresenceToday({ ymd: zurichYmd() });
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const awayIds = useMemo(() => awayIdsFromAbsence(absence), [absence]);
  const people = useMemo(
    () => applyLegacyAbsence(data?.people || [], awayIds),
    [awayIds, data?.people]
  );
  const self = useMemo(
    () =>
      applyLegacyAbsenceSelf(
        data?.self ?? null,
        Boolean(absence?.self?.isAwayToday)
      ),
    [absence?.self?.isAwayToday, data?.self]
  );
  const counts = useMemo(() => presenceCounts(people), [people]);
  const locked = isOwnDayLocked(self?.source ?? null);
  const sourceHint = presenceSourceHint(self?.source ?? null, locale);
  const actor = {
    isAdmin: Boolean(me?.isAdmin),
    canManagePresence: Boolean(self?.canManagePresence || me?.isAdmin),
    organization: self?.organization ?? null,
  };
  const showDelegate = canManageOthers(actor);
  const showMorning = Boolean(self && !self.status && !locked);
  const loading = !data && !error;
  const choosing = showMorning || editing;
  const showChange = Boolean(self?.status) && !locked;
  const showActions = !choosing && (showChange || showDelegate);

  const statusTitle = showMorning
    ? t("presence.howToday")
    : editing
      ? t("presence.changeStatus")
      : self?.status
        ? t("presence.youStatus", {
            status: presenceDisplayLabel(self.status, locale),
          })
        : t("presence.youStillOpen");

  async function clearOwn() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await deleteOwnDayStatus({ ymd: data.ymd });
      await load();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function setOwn(status: PresenceStatus) {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await putOwnDayStatus({ ymd: data.ymd, status });
      await load();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveDelegate(input: {
    userId: number;
    status: PresenceStatus;
  }) {
    if (!data) return;
    setBusy(true);
    setDelegateError(null);
    try {
      await putDelegatedDayStatus({
        userId: input.userId,
        ymd: data.ymd,
        status: input.status,
      });
      await load();
      setDelegateOpen(false);
    } catch (err) {
      setDelegateError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-2xl px-3 py-2 ring-1",
        PRESENCE_STATUS_SURFACE[self?.status ?? "unset"]
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="text-sm leading-snug text-muted-foreground">
              {t("presence.loading")}
            </p>
          ) : (
            <p className="inline-flex min-w-0 items-start gap-1.5 text-sm font-semibold leading-snug">
              <PresenceStatusGlyph
                status={self?.status}
                className="mt-0.5"
              />
              <span className="min-w-0 break-words">
                {statusTitle}
                {!choosing && sourceHint ? (
                  <span className="font-normal opacity-80">
                    {" "}
                    · {sourceHint}
                  </span>
                ) : null}
              </span>
            </p>
          )}
          {!loading ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] leading-snug opacity-80">
              <span className="inline-flex items-center gap-1">
                <span
                  className={cn("size-1.5 rounded-full", PRESENCE_STATUS_DOT.office)}
                  aria-hidden
                />
                {t("presence.hereCount", { count: counts.here })}
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className={cn("size-1.5 rounded-full", PRESENCE_STATUS_DOT.sick)}
                  aria-hidden
                />
                {t("presence.awayCount", { count: counts.away })}
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className={cn("size-1.5 rounded-full", PRESENCE_STATUS_DOT.unset)}
                  aria-hidden
                />
                {t("presence.openCount", { count: counts.open })}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/team"
            className="inline-flex items-center gap-1 px-1.5 text-[0.75rem] font-semibold underline-offset-2 hover:underline"
          >
            <Users className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            {t("nav.team")}
          </Link>
          {showActions ? (
            <>
              {showChange ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  {...segmentedTriggerProps}
                  onClick={() => setEditing(true)}
                >
                  {t("presence.change")}
                </Button>
              ) : null}
              {showDelegate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  {...segmentedTriggerProps}
                  onClick={() => {
                    setDelegateError(null);
                    setDelegateOpen(true);
                  }}
                >
                  {t("presence.setForColleague")}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {choosing ? (
        <>
          <PresenceStatusPills
            value={self?.status ?? null}
            onChange={(status) => void setOwn(status)}
            disabled={busy || locked}
            ariaLabel={t("presence.howToday")}
          />
          {editing ? (
            <div className="flex flex-wrap items-center gap-1">
              {self?.source === "self" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  {...segmentedTriggerProps}
                  onClick={() => void clearOwn()}
                >
                  {t("presence.useRule")}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                {...segmentedTriggerProps}
                onClick={() => setEditing(false)}
              >
                {t("common.done")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      <PresenceDelegateDialog
        open={delegateOpen}
        onOpenChange={setDelegateOpen}
        people={people}
        actor={actor}
        selfUserId={self?.userId ?? me?.userId ?? null}
        ymd={data?.ymd || zurichYmd()}
        busy={busy}
        error={delegateError}
        onSave={(input) => void saveDelegate(input)}
      />
    </div>
  );
}
