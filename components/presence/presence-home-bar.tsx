"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresenceStatusPills } from "@/components/presence/presence-status-pills";
import { PresenceDelegateDialog } from "@/components/presence/presence-delegate-dialog";
import { PresenceGlassPanel } from "@/components/presence/presence-glass-panel";
import { PresenceIsoArt } from "@/components/presence/presence-iso-art";
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
  type PresenceTodayResponse,
} from "@/lib/presence/client";
import type { PresenceStatus } from "@/lib/presence/status";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { presenceDisplayLabel } from "@/lib/i18n/display";

function awayIdsFromAbsence(absence: HomeAbsenceState | null): number[] {
  if (!absence) return [];
  const ids = absence.colleagues.map((c) => c.userId);
  if (absence.self?.isAwayToday && absence.self) {
    /* self id is not on the absence payload; overlay uses isAwayToday */
  }
  return ids;
}

const overlayChip =
  "w-fit max-w-[min(20rem,calc(100%-5.5rem))] px-2.5 py-1.5";

const overlayActionBtn = "h-11 min-h-11 px-2.5 leading-snug";

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
    () => applyLegacyAbsenceSelf(data?.self ?? null, Boolean(absence?.self?.isAwayToday)),
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
  const artStatus = !choosing ? (self?.status ?? null) : null;
  const showChange = Boolean(artStatus && !locked);
  const showActions = showChange || showDelegate;

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

  const statusLine = (
    <p className="min-w-0 break-words text-base font-semibold leading-snug">
      {statusTitle}
      {!choosing && sourceHint ? (
        <span className="ml-1 font-normal text-muted-foreground">
          · {sourceHint}
        </span>
      ) : null}
    </p>
  );

  const countRow = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-snug text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-orange-500" aria-hidden />
        {t("presence.hereCount", { count: counts.here })}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-rose-500" aria-hidden />
        {t("presence.awayCount", { count: counts.away })}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden />
        {t("presence.openCount", { count: counts.open })}
      </span>
    </div>
  );

  const teamLink = (
    <Link
      href="/team"
      className="inline-flex min-h-11 items-center gap-1 px-2.5 font-semibold text-foreground underline-offset-2 hover:underline"
    >
      <Users className="size-3.5" strokeWidth={APP_ICON_STROKE} />
      {t("nav.team")}
    </Link>
  );

  function actionButton(
    label: string,
    onClick: () => void,
    variant: "ghost" | "outline"
  ) {
    const button = (
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={busy}
        className={overlayActionBtn}
        onClick={onClick}
      >
        {label}
      </Button>
    );
    if (variant === "ghost") {
      return <PresenceGlassPanel className="p-0">{button}</PresenceGlassPanel>;
    }
    return button;
  }

  function actionButtons(variant: "ghost" | "outline") {
    return (
      <>
        {showChange
          ? actionButton(t("presence.change"), () => setEditing(true), variant)
          : null}
        {showDelegate
          ? actionButton(
              t("presence.setForColleague"),
              () => {
                setDelegateError(null);
                setDelegateOpen(true);
              },
              variant
            )
          : null}
      </>
    );
  }

  const editor = (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{statusLine}</div>
        {choosing ? <PresenceIsoArt status={self?.status} variant="thumb" /> : null}
      </div>
      <PresenceStatusPills
        value={self?.status ?? null}
        onChange={(status) => void setOwn(status)}
        disabled={busy || locked}
        ariaLabel={t("presence.howToday")}
      />
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          {self?.source === "self" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
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
            onClick={() => setEditing(false)}
          >
            {t("common.done")}
          </Button>
        </div>
      ) : null}
    </div>
  );

  const dialog = (
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
  );

  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-foreground/10",
        artStatus ? "bg-zinc-200 dark:bg-zinc-900" : "bg-card px-3 py-2.5"
      )}
    >
      {artStatus ? <PresenceIsoArt status={artStatus} variant="hero" /> : null}
      {artStatus ? (
        <div className="relative z-10 flex min-h-[8.25rem] flex-col justify-between gap-2 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <PresenceGlassPanel className={cn("space-y-1", overlayChip)}>
              {statusLine}
              {countRow}
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </PresenceGlassPanel>
            <PresenceGlassPanel className="shrink-0 p-0">{teamLink}</PresenceGlassPanel>
          </div>
          {showActions ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {actionButtons("ghost")}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-w-0 space-y-2.5">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("presence.loading")}</p>
          ) : showMorning || editing ? (
            editor
          ) : (
            statusLine
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!loading ? (
            <div className="flex flex-wrap items-center gap-2">
              {countRow}
              <div className="ml-auto">{teamLink}</div>
            </div>
          ) : null}
          {showActions ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {actionButtons("outline")}
            </div>
          ) : null}
        </div>
      )}
      {dialog}
    </div>
  );
}
