"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresenceStatusPills } from "@/components/presence/presence-status-pills";
import { PresenceDelegateDialog } from "@/components/presence/presence-delegate-dialog";
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
  PRESENCE_STATUS_LABELS,
  putDelegatedDayStatus,
  putOwnDayStatus,
  type PresenceTodayResponse,
} from "@/lib/presence/client";
import type { PresenceStatus } from "@/lib/presence/status";

function awayIdsFromAbsence(absence: HomeAbsenceState | null): number[] {
  if (!absence) return [];
  const ids = absence.colleagues.map((c) => c.userId);
  if (absence.self?.isAwayToday && absence.self) {
    /* self id is not on the absence payload; overlay uses isAwayToday */
  }
  return ids;
}

export function PresenceHomeBar({
  absence,
}: {
  absence: HomeAbsenceState | null;
}) {
  const { me } = useAuth();
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
  const sourceHint = presenceSourceHint(self?.source ?? null);
  const actor = {
    isAdmin: Boolean(me?.isAdmin),
    canManagePresence: Boolean(self?.canManagePresence || me?.isAdmin),
    organization: self?.organization ?? null,
  };
  const showDelegate = canManageOthers(actor);
  const showMorning = Boolean(self && !self.status && !locked);
  const loading = !data && !error;

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
    <div className="space-y-2.5 rounded-2xl bg-card px-3 py-2.5 shadow-sm ring-1 ring-foreground/10">
      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Anwesenheit…</p>
      ) : showMorning || editing ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold leading-snug">
            {showMorning ? "Wie arbeitest du heute?" : "Status ändern"}
          </p>
          <PresenceStatusPills
            value={self?.status ?? null}
            onChange={(status) => void setOwn(status)}
            disabled={busy || locked}
            ariaLabel="Wie arbeitest du heute?"
          />
          {editing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Fertig
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
            {self?.status
              ? `Du: ${PRESENCE_STATUS_LABELS[self.status]}`
              : "Du: noch offen"}
            {sourceHint ? (
              <span className="ml-1 font-normal text-muted-foreground">
                · {sourceHint}
              </span>
            ) : null}
          </p>
          {!locked ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Ändern
            </Button>
          ) : null}
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2 text-xs leading-snug text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-orange-500" aria-hidden />
          {counts.here} da
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-rose-500" aria-hidden />
          {counts.away} nicht da
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden />
          {counts.open} offen
        </span>
        <Link
          href="/team"
          className="ml-auto inline-flex min-h-11 items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline"
        >
          <Users className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          Team
        </Link>
      </div>

      {showDelegate ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setDelegateError(null);
            setDelegateOpen(true);
          }}
        >
          Für Kollege setzen
        </Button>
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
