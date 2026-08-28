"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
  segmentedTriggerProps,
} from "@/components/layout/segmented-control";
import { PresencePersonCard } from "@/components/presence/presence-person-card";
import { PresenceSetDialog } from "@/components/presence/presence-set-dialog";
import { PresenceDelegateDialog } from "@/components/presence/presence-delegate-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";
import { mondayOfWeek, weekdaysMonFri } from "@/lib/presence/week";
import {
  applyLegacyAbsence,
  applyLegacyAbsenceSelf,
  canOverridePerson,
  fetchPresenceToday,
  groupPresencePeople,
  isOwnDayLocked,
  organizationLabel,
  PRESENCE_GROUP_LABELS,
  PRESENCE_STATUS_LABELS,
  PRESENCE_STATUS_SURFACE,
  presenceSourceHint,
  deleteOwnDayStatus,
  putDelegatedDayStatus,
  putOwnDayStatus,
  type PresenceGroupId,
  type PresencePersonView,
  type PresenceTodayResponse,
} from "@/lib/presence/client";
import {
  USER_ORGANIZATION_LABELS,
  USER_ORGANIZATIONS,
  type UserOrganization,
} from "@/lib/users/organization";
import type { HomeAbsenceState } from "@/lib/dashboard/home-surfaces-shared";
import type { PresenceStatus } from "@/lib/presence/status";
import { formatSwissDate, formatSwissDateRange } from "@/lib/utils/dates";

type OrgFilter = "" | UserOrganization;
type BoardView = "day" | "week";

const GROUP_ORDER: PresenceGroupId[] = ["here", "away", "open"];

function formatLongDeDate(ymd: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

function weekdayShort(ymd: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

async function fetchAbsenceToday(): Promise<HomeAbsenceState | null> {
  try {
    const res = await fetch("/api/me/absence");
    if (!res.ok) return null;
    return (await res.json()) as HomeAbsenceState;
  } catch {
    return null;
  }
}

export function PresenceTeamBoard() {
  const { me } = useAuth();
  const today = zurichYmd();
  const [view, setView] = useState<BoardView>("day");
  const [ymd, setYmd] = useState(today);
  const [org, setOrg] = useState<OrgFilter>("");
  const [dayData, setDayData] = useState<PresenceTodayResponse | null>(null);
  const [weekByYmd, setWeekByYmd] = useState<
    Record<string, PresenceTodayResponse>
  >({});
  const [absence, setAbsence] = useState<HomeAbsenceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selfTarget, setSelfTarget] = useState<{
    ymd: string;
    person: PresencePersonView;
  } | null>(null);
  const [delegateTarget, setDelegateTarget] = useState<{
    ymd: string;
    userId: number;
  } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const loadDay = useCallback(async (day: string, organization: OrgFilter) => {
    const json = await fetchPresenceToday({
      ymd: day,
      organization: organization || null,
    });
    setDayData(json);
  }, []);

  const loadWeek = useCallback(
    async (day: string, organization: OrgFilter) => {
      const days = weekdaysMonFri(day);
      if (!days) return;
      const rows = await Promise.all(
        days.map((d) =>
          fetchPresenceToday({ ymd: d, organization: organization || null })
        )
      );
      const next: Record<string, PresenceTodayResponse> = {};
      rows.forEach((row) => {
        next[row.ymd] = row;
      });
      setWeekByYmd(next);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        if (view === "day") {
          await loadDay(ymd, org);
          if (ymd === today) {
            const legacy = await fetchAbsenceToday();
            if (!cancelled) setAbsence(legacy);
          } else if (!cancelled) {
            setAbsence(null);
          }
        } else {
          await loadWeek(ymd, org);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDay, loadWeek, org, today, view, ymd]);

  const awayIds = useMemo(() => {
    if (!absence || ymd !== today) return [];
    return absence.colleagues.map((c) => c.userId);
  }, [absence, today, ymd]);

  const people = useMemo(() => {
    const raw = dayData?.people || [];
    return ymd === today ? applyLegacyAbsence(raw, awayIds) : raw;
  }, [awayIds, dayData?.people, today, ymd]);

  const self = useMemo(() => {
    const raw = dayData?.self ?? null;
    return ymd === today
      ? applyLegacyAbsenceSelf(raw, Boolean(absence?.self?.isAwayToday))
      : raw;
  }, [absence?.self?.isAwayToday, dayData?.self, today, ymd]);

  const groups = useMemo(() => groupPresencePeople(people), [people]);
  const actor = {
    isAdmin: Boolean(me?.isAdmin),
    canManagePresence: Boolean(self?.canManagePresence || me?.isAdmin),
    organization: self?.organization ?? null,
  };
  const weekDays = weekdaysMonFri(ymd) || [];
  const weekSelfByYmd = useMemo(() => {
    const map: Record<string, PresencePersonView | null> = {};
    for (const day of weekDays) {
      map[day] = weekByYmd[day]?.self ?? null;
    }
    return map;
  }, [weekByYmd, weekDays]);
  const weekPeople = useMemo(() => {
    const byId = new Map<number, PresencePersonView>();
    for (const day of weekDays) {
      for (const person of weekByYmd[day]?.people || []) {
        if (!byId.has(person.userId)) byId.set(person.userId, person);
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "de")
    );
  }, [weekByYmd, weekDays]);

  function shiftDay(delta: number) {
    setYmd((prev) => addDaysYmd(prev, delta));
  }

  function shiftWeek(deltaWeeks: number) {
    const monday = mondayOfWeek(ymd);
    if (!monday) return;
    setYmd(addDaysYmd(monday, deltaWeeks * 7));
  }

  async function clearOwn(day: string) {
    setBusy(true);
    setDialogError(null);
    try {
      await deleteOwnDayStatus({ ymd: day });
      if (view === "day") await loadDay(ymd, org);
      else await loadWeek(ymd, org);
      setSelfTarget(null);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveOwn(day: string, status: PresenceStatus) {
    setBusy(true);
    setDialogError(null);
    try {
      await putOwnDayStatus({ ymd: day, status });
      if (view === "day") await loadDay(ymd, org);
      else await loadWeek(ymd, org);
      setSelfTarget(null);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveDelegate(input: {
    userId: number;
    status: PresenceStatus;
  }) {
    const day = delegateTarget?.ymd || ymd;
    setBusy(true);
    setDialogError(null);
    try {
      await putDelegatedDayStatus({
        userId: input.userId,
        ymd: day,
        status: input.status,
      });
      if (view === "day") await loadDay(ymd, org);
      else await loadWeek(ymd, org);
      setDelegateTarget(null);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function openPerson(person: PresencePersonView, day = ymd) {
    if (self && person.userId === self.userId) {
      setDialogError(null);
      setSelfTarget({ ymd: day, person });
      return;
    }
    if (canOverridePerson(actor, person)) {
      setDialogError(null);
      setDelegateTarget({ ymd: day, userId: person.userId });
    }
  }

  const delegatePeople = view === "day" ? people : weekPeople;

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      <PageHeader
        title="Team"
        description="Wer ist da, wer nicht — nach Organisation und Tag."
        icon={pageVisuals.team.icon}
        tone={pageVisuals.team.tone}
      />

      <div className="flex flex-col gap-3">
        <div
          className={cn(segmentedTrackClass, "w-fit")}
          role="tablist"
          aria-label="Ansicht"
        >
          <Button
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={view === "day"}
            {...segmentedTriggerProps}
            className={segmentedTriggerClass(view === "day")}
            onClick={() => setView("day")}
          >
            <Calendar className="size-4" strokeWidth={APP_ICON_STROKE} />
            Tag
          </Button>
          <Button
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={view === "week"}
            {...segmentedTriggerProps}
            className={segmentedTriggerClass(view === "week")}
            onClick={() => setView("week")}
          >
            <CalendarRange className="size-4" strokeWidth={APP_ICON_STROKE} />
            Woche
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={view === "week" ? "Vorherige Woche" : "Vorheriger Tag"}
            onClick={() =>
              view === "week" ? shiftWeek(-1) : shiftDay(-1)
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold capitalize leading-snug">
              {view === "week"
                ? formatSwissDateRange(weekDays[0], weekDays[4])
                : formatLongDeDate(ymd)}
            </p>
            <p className="text-xs text-muted-foreground">
              {view === "week" ? "Montag bis Freitag" : formatSwissDate(ymd)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={view === "week" ? "Nächste Woche" : "Nächster Tag"}
            onClick={() => (view === "week" ? shiftWeek(1) : shiftDay(1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {ymd !== today ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setYmd(today)}
            >
              Heute
            </Button>
          ) : null}
        </div>

        <div
          className={cn(segmentedTrackClass, "w-full max-w-full flex-nowrap")}
          role="radiogroup"
          aria-label="Organisation"
        >
          <Button
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={org === ""}
            {...segmentedTriggerProps}
            className={cn(segmentedTriggerClass(org === ""), "flex-1")}
            onClick={() => setOrg("")}
          >
            Alle
          </Button>
          {USER_ORGANIZATIONS.map((code) => (
            <Button
              key={code}
              type="button"
              variant="ghost"
              role="radio"
              aria-checked={org === code}
              aria-label={USER_ORGANIZATION_LABELS[code]}
              title={USER_ORGANIZATION_LABELS[code]}
              {...segmentedTriggerProps}
              className={cn(segmentedTriggerClass(org === code), "flex-1")}
              onClick={() => setOrg(code)}
            >
              {code}
            </Button>
          ))}
        </div>
        {org ? (
          <p className="text-xs text-muted-foreground">
            {USER_ORGANIZATION_LABELS[org]}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!dayData && view === "day" && !error ? (
        <p className="text-sm text-muted-foreground">Lade Team…</p>
      ) : null}

      {view === "day" && dayData ? (
        <div className="space-y-6">
          {GROUP_ORDER.map((groupId) => (
            <section key={groupId} className="space-y-2">
              <h2 className="text-sm font-bold tracking-tight">
                {PRESENCE_GROUP_LABELS[groupId]}
                <span className="ml-1.5 font-medium text-muted-foreground">
                  {groups[groupId].length}
                </span>
              </h2>
              {groups[groupId].length === 0 ? (
                <p className="text-sm text-muted-foreground">Niemand</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {groups[groupId].map((person) => {
                    const isSelf = self?.userId === person.userId;
                    const interactive =
                      isSelf || canOverridePerson(actor, person);
                    return (
                      <li key={person.userId}>
                        <PresencePersonCard
                          person={person}
                          isSelf={isSelf}
                          interactive={interactive}
                          onClick={
                            interactive
                              ? () => openPerson(person)
                              : undefined
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : null}

      {view === "week" ? (
        <div className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-sm font-bold tracking-tight">Deine Woche</h2>
            <p className="text-xs text-muted-foreground">
              Tippe einen Tag, um ihn zu setzen.
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {weekDays.map((day) => {
                const person = weekSelfByYmd[day];
                const locked = isOwnDayLocked(person?.source ?? null);
                const surface =
                  PRESENCE_STATUS_SURFACE[person?.status ?? "unset"];
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!person}
                    onClick={() => {
                      if (!person) return;
                      setDialogError(null);
                      setSelfTarget({ ymd: day, person });
                    }}
                    className={cn(
                      "flex min-h-11 flex-col items-start gap-0.5 rounded-2xl px-2 py-2 text-left shadow-sm ring-1",
                      surface,
                      day === today && "ring-2 ring-primary/70"
                    )}
                  >
                    <span className="text-[0.7rem] font-semibold uppercase">
                      {weekdayShort(day)}
                    </span>
                    <span className="break-words text-xs font-medium leading-snug">
                      {person?.status
                        ? PRESENCE_STATUS_LABELS[person.status]
                        : "Offen"}
                    </span>
                    {presenceSourceHint(person?.source ?? null) ? (
                      <span className="text-[0.65rem] leading-snug">
                        {presenceSourceHint(person?.source ?? null)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold tracking-tight">Kolleginnen und Kollegen</h2>
            {weekPeople.filter((p) => p.userId !== self?.userId).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Niemand in diesem Filter.
              </p>
            ) : (
              <ul className="space-y-2">
                {weekPeople
                  .filter((p) => p.userId !== self?.userId)
                  .map((person) => (
                    <li
                      key={person.userId}
                      className="rounded-2xl bg-card px-3 py-2.5 shadow-sm ring-1 ring-foreground/10"
                    >
                      <p className="break-words text-sm font-semibold leading-snug">
                        {person.displayName}
                      </p>
                      <p className="mb-2 text-[0.7rem] text-muted-foreground">
                        {organizationLabel(person.organization)}
                      </p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {weekDays.map((day) => {
                          const cell = (weekByYmd[day]?.people || []).find(
                            (row) => row.userId === person.userId
                          );
                          const surface =
                            PRESENCE_STATUS_SURFACE[cell?.status ?? "unset"];
                          return (
                            <div
                              key={day}
                              className={cn(
                                "rounded-xl px-1.5 py-1.5 ring-1",
                                surface
                              )}
                            >
                              <p className="text-[0.65rem] font-semibold uppercase">
                                {weekdayShort(day)}
                              </p>
                              <p className="break-words text-[0.7rem] leading-snug">
                                {cell?.status
                                  ? PRESENCE_STATUS_LABELS[cell.status]
                                  : "Offen"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <PresenceSetDialog
        open={Boolean(selfTarget)}
        onOpenChange={(next) => {
          if (!next) setSelfTarget(null);
        }}
        person={selfTarget?.person ?? null}
        ymd={selfTarget?.ymd || ymd}
        locked={isOwnDayLocked(selfTarget?.person.source ?? null)}
        lockedReason={
          presenceSourceHint(selfTarget?.person.source ?? null)
            ? `Dieser Tag wurde über ${presenceSourceHint(selfTarget?.person.source ?? null)} gesetzt.`
            : null
        }
        busy={busy}
        error={selfTarget ? dialogError : null}
        onSelect={(status) => {
          if (!selfTarget) return;
          void saveOwn(selfTarget.ymd, status);
        }}
        onClear={
          selfTarget?.person.source === "self"
            ? () => void clearOwn(selfTarget.ymd)
            : undefined
        }
      />

      <PresenceDelegateDialog
        open={Boolean(delegateTarget)}
        onOpenChange={(next) => {
          if (!next) setDelegateTarget(null);
        }}
        people={delegatePeople}
        actor={actor}
        selfUserId={self?.userId ?? me?.userId ?? null}
        ymd={delegateTarget?.ymd || ymd}
        initialUserId={delegateTarget?.userId}
        busy={busy}
        error={delegateTarget ? dialogError : null}
        onSave={(input) => void saveDelegate(input)}
      />
    </div>
  );
}
