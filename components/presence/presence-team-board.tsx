"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TranslatedPageHeader } from "@/components/layout/translated-page-header";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
  segmentedTriggerProps,
} from "@/components/layout/segmented-control";
import { PresencePersonCard } from "@/components/presence/presence-person-card";
import { PresenceSetDialog } from "@/components/presence/presence-set-dialog";
import { PresenceDelegateDialog } from "@/components/presence/presence-delegate-dialog";
import { PresenceStatusLegend } from "@/components/presence/presence-status-legend";
import { PresenceWeekMatrix } from "@/components/presence/presence-week-matrix";
import { PublicHolidayMark } from "@/components/holidays/public-holiday-mark";
import {
  CountryCodeWithFlag,
  OrganizationWithFlag,
} from "@/components/branding/country-flag";
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
  presenceSourceHint,
  deleteOwnDayStatus,
  putDelegatedDayStatus,
  putOwnDayStatus,
  type PresenceGroupId,
  type PresencePersonView,
  type PresenceTodayResponse,
} from "@/lib/presence/client";
import {
  USER_ORGANIZATIONS,
  type UserOrganization,
} from "@/lib/users/organization";
import type { HomeAbsenceState } from "@/lib/dashboard/home-surfaces-shared";
import type { PresenceStatus } from "@/lib/presence/status";
import { formatSwissDateRange } from "@/lib/utils/dates";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { organizationDisplayLabel } from "@/lib/i18n/display";
import type { MessageKey } from "@/lib/i18n";
import { fetchPublicHolidays } from "@/lib/presence/public-holidays-client";
import {
  publicHolidayDayOn,
  type PublicHolidayDay,
  type PublicHolidayProbe,
} from "@/lib/presence/public-holidays-shared";

type OrgFilter = "" | UserOrganization;
type BoardView = "day" | "week";

const GROUP_ORDER: PresenceGroupId[] = ["here", "away", "open"];

const GROUP_KEYS: Record<PresenceGroupId, MessageKey> = {
  here: "presence.here",
  away: "presence.away",
  open: "presence.open",
};

function formatLongDate(ymd: string, intl: string): string {
  return new Intl.DateTimeFormat(intl, {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
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
  const t = useT();
  const { locale, intlLocale } = useLocale();
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
  const [holidayDays, setHolidayDays] = useState<PublicHolidayDay[]>([]);
  const [holidayReason, setHolidayReason] = useState<
    "no-reader" | "unreadable" | null
  >(null);
  const [holidayProbe, setHolidayProbe] = useState<PublicHolidayProbe | null>(
    null
  );

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

  useEffect(() => {
    const days = view === "week" ? weekdaysMonFri(ymd) : null;
    const from = days?.[0] || ymd;
    const to = days?.[4] || ymd;
    let cancelled = false;
    void fetchPublicHolidays(from, to).then((next) => {
      if (cancelled) return;
      setHolidayDays(next.days);
      setHolidayReason(next.reason);
      setHolidayProbe(next.probe);
    });
    return () => {
      cancelled = true;
    };
  }, [view, ymd]);

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
  const dayHoliday = useMemo(
    () => publicHolidayDayOn(holidayDays, ymd),
    [holidayDays, ymd]
  );
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
  const weekSelf = useMemo(() => {
    for (const day of weekDays) {
      const row = weekByYmd[day]?.self;
      if (row) return row;
    }
    return self;
  }, [self, weekByYmd, weekDays]);
  const weekPeople = useMemo(() => {
    const byId = new Map<number, PresencePersonView>();
    for (const day of weekDays) {
      for (const person of weekByYmd[day]?.people || []) {
        if (!byId.has(person.userId)) byId.set(person.userId, person);
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, locale)
    );
  }, [locale, weekByYmd, weekDays]);

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
    <div className="space-y-6 pb-28 md:pb-8">
      <TranslatedPageHeader
        titleKey="team.title"
        descriptionKey="team.description"
        visual="team"
      />

      <div className="flex flex-col gap-3">
        <div
          className={cn(segmentedTrackClass, "w-fit")}
          role="tablist"
          aria-label={t("common.view")}
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
            {t("common.day")}
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
            {t("common.week")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={
              view === "week" ? t("presence.previousWeek") : t("presence.previousDay")
            }
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
                : formatLongDate(ymd, intlLocale)}
            </p>
            {view === "week" ? (
              <p className="text-xs text-muted-foreground">
                {t("presence.monFri")}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={
              view === "week" ? t("presence.nextWeek") : t("presence.nextDay")
            }
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
              {t("common.today")}
            </Button>
          ) : null}
        </div>

        <div
          className={cn(segmentedTrackClass, "w-full max-w-full flex-nowrap")}
          role="radiogroup"
          aria-label={t("common.organization")}
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
            {t("common.all")}
          </Button>
          {USER_ORGANIZATIONS.map((code) => (
            <Button
              key={code}
              type="button"
              variant="ghost"
              role="radio"
              aria-checked={org === code}
              aria-label={organizationDisplayLabel(code, locale)}
              title={organizationDisplayLabel(code, locale)}
              {...segmentedTriggerProps}
              className={cn(segmentedTriggerClass(org === code), "flex-1")}
              onClick={() => setOrg(code)}
            >
              <CountryCodeWithFlag code={code} locale={locale} />
            </Button>
          ))}
        </div>
        {org ? (
          <p className="text-xs text-muted-foreground">
            <OrganizationWithFlag
              organization={org}
              label={organizationDisplayLabel(org, locale)}
              locale={locale}
            />
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {holidayReason === "no-reader" ? (
        <p className="text-sm text-muted-foreground">
          {t("presence.holidayNoReader")}
        </p>
      ) : null}
      {holidayReason === "unreadable" ? (
        <p className="text-sm text-muted-foreground">
          {t("presence.holidayUnreadable")}
        </p>
      ) : null}
      {holidayDays.length === 0 && holidayProbe ? (
        <div className="rounded-2xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            {t("presence.holidayProbeTitle")}
          </p>
          <p>
            {t("presence.holidayProbeMailbox", { mailbox: holidayProbe.mailbox })}
          </p>
          <p>
            {t("presence.holidayProbeCalendars", {
              names:
                holidayProbe.calendars.join(" · ") ||
                t("presence.holidayProbeNone"),
            })}
          </p>
          <p>
            {holidayProbe.samples.length > 0
              ? t("presence.holidayProbeEvents", {
                  samples: holidayProbe.samples.join(" · "),
                })
              : t("presence.holidayProbeEmpty")}
          </p>
          {holidayProbe.error ? (
            <p>
              {t("presence.holidayProbeError", { error: holidayProbe.error })}
            </p>
          ) : null}
        </div>
      ) : null}
      {((view === "day" && !dayData) ||
        (view === "week" && Object.keys(weekByYmd).length === 0)) &&
      !error ? (
        <p className="text-sm text-muted-foreground">{t("presence.loadingTeam")}</p>
      ) : null}

      {view === "day" && dayData ? (
        <div className="space-y-6">
          {dayHoliday ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-violet-50 px-3 py-2 ring-1 ring-violet-200/80 dark:bg-violet-500/10 dark:ring-violet-400/25">
              <p className="text-sm font-semibold text-violet-950 dark:text-violet-50">
                {t("presence.holidayOnDay")}
              </p>
              <PublicHolidayMark
                countries={dayHoliday.countries}
                titles={dayHoliday.titles}
                items={dayHoliday.items}
                layout="inline"
              />
            </div>
          ) : null}
          <PresenceStatusLegend />
          {GROUP_ORDER.map((groupId) => (
            <section key={groupId} className="space-y-2">
              <h2 className="text-sm font-bold tracking-tight">
                {t(GROUP_KEYS[groupId])}
                <span className="ml-1.5 font-medium text-muted-foreground">
                  {groups[groupId].length}
                </span>
              </h2>
              {groups[groupId].length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("common.nobody")}</p>
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

      {view === "week" && Object.keys(weekByYmd).length > 0 ? (
        <PresenceWeekMatrix
          weekDays={weekDays}
          today={today}
          self={weekSelf}
          weekSelfByYmd={weekSelfByYmd}
          weekPeople={weekPeople}
          weekByYmd={weekByYmd}
          holidayDays={holidayDays}
          actor={actor}
          onOpenSelf={(day, person) => {
            setDialogError(null);
            setSelfTarget({ ymd: day, person });
          }}
          onOpenPerson={(person, day) => openPerson(person, day)}
        />
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
          presenceSourceHint(selfTarget?.person.source ?? null, locale)
            ? t("presence.lockedVia", {
                source: presenceSourceHint(
                  selfTarget?.person.source ?? null,
                  locale
                ),
              })
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
