"use client";

import type { ReactNode } from "react";
import { OrganizationWithFlag } from "@/components/branding/country-flag";
import { PresenceStatusCell } from "@/components/presence/presence-status-cell";
import { PresenceStatusLegend } from "@/components/presence/presence-status-legend";
import { PublicHolidayChips } from "@/components/holidays/public-holiday-chips";
import { PublicHolidayMark } from "@/components/holidays/public-holiday-mark";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import {
  canOverridePerson,
  organizationLabel,
  presenceSourceHint,
  type PresencePersonView,
  type PresenceTodayResponse,
} from "@/lib/presence/client";
import { presenceDisplayLabel } from "@/lib/i18n/display";
import type { Locale } from "@/lib/i18n";
import {
  PUBLIC_HOLIDAYS_UI_ENABLED,
  publicHolidayDayOn,
  type PublicHolidayDay,
} from "@/lib/presence/public-holidays-shared";

type Actor = {
  isAdmin: boolean;
  canManagePresence: boolean;
  organization: PresencePersonView["organization"];
};

function weekdayShort(ymd: string, intl: string): string {
  return new Intl.DateTimeFormat(intl, {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

function weekdayLong(ymd: string, intl: string): string {
  const raw = new Intl.DateTimeFormat(intl, {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${ymd}T12:00:00Z`));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const MATRIX =
  "grid grid-cols-[minmax(7.5rem,10rem)_repeat(5,minmax(4.75rem,1fr))] gap-1.5";

function MatrixName({
  title,
  subtitle,
  highlight,
}: {
  title: string;
  subtitle?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 min-w-0 flex-col justify-center px-1 py-1",
        highlight && "rounded-xl bg-muted"
      )}
    >
      <p className="break-words text-sm font-semibold leading-snug">{title}</p>
      {subtitle ? (
        <div className="break-words text-[0.7rem] leading-snug text-muted-foreground">
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function dayCellProps(
  day: string,
  today: string,
  person: PresencePersonView | null,
  locale: Locale,
  intlLocale: string,
  openLabel: string,
  unsetLabel: string
) {
  const status = person?.status ?? null;
  const hint = presenceSourceHint(person?.source ?? null, locale);
  const label = status
    ? presenceDisplayLabel(status, locale, "pill")
    : openLabel;
  const spokenStatus = status ? label : unsetLabel;
  const dayName = weekdayLong(day, intlLocale);
  return {
    status,
    label,
    hint,
    spoken: `${dayName}: ${spokenStatus}${hint ? ` · ${hint}` : ""}`,
    isToday: day === today,
  };
}

export function PresenceWeekMatrix({
  weekDays,
  today,
  self,
  weekSelfByYmd,
  weekPeople,
  weekByYmd,
  holidayDays,
  actor,
  onOpenSelf,
  onOpenPerson,
}: {
  weekDays: string[];
  today: string;
  self: PresencePersonView | null;
  weekSelfByYmd: Record<string, PresencePersonView | null>;
  weekPeople: PresencePersonView[];
  weekByYmd: Record<string, PresenceTodayResponse>;
  holidayDays: PublicHolidayDay[];
  actor: Actor;
  onOpenSelf: (day: string, person: PresencePersonView) => void;
  onOpenPerson: (person: PresencePersonView, day: string) => void;
}) {
  const t = useT();
  const { locale, intlLocale } = useLocale();
  const colleagues = weekPeople.filter((p) => p.userId !== self?.userId);
  const openLabel = t("presence.open");
  const unsetLabel = t("presence.unset");

  return (
    <div className="space-y-3">
      <PresenceStatusLegend />
      <p className="text-xs text-muted-foreground">{t("presence.tapDay")}</p>
      <div className="-mx-1 overflow-x-auto px-1 py-1.5">
        <div
          className="min-w-[40rem] space-y-1.5 pb-2"
          role="grid"
          aria-label={t("presence.yourWeek")}
        >
          <div className={MATRIX} role="row">
            <div />
            {weekDays.map((day) => {
              const isToday = day === today;
              const label = weekdayShort(day, intlLocale);
              const holiday = PUBLIC_HOLIDAYS_UI_ENABLED
                ? publicHolidayDayOn(holidayDays, day)
                : null;
              return (
                <div
                  key={day}
                  role="columnheader"
                  className="flex min-h-10 flex-col items-center justify-center gap-2 px-1 py-1"
                >
                  <span
                    className={cn(
                      "px-2.5 py-1 text-xs font-bold leading-none",
                      isToday && "rounded-full ring-2 ring-primary/70"
                    )}
                    aria-current={isToday ? "date" : undefined}
                  >
                    {label}
                  </span>
                  <span className="text-[0.7rem] leading-none text-muted-foreground">
                    {Number(day.slice(8))}
                  </span>
                  {holiday ? (
                    <PublicHolidayChips
                      countries={holiday.countries}
                      titles={holiday.titles}
                      locale={locale}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          {PUBLIC_HOLIDAYS_UI_ENABLED ? (
          <div className={MATRIX} role="row">
            <MatrixName title={t("presence.holidayRow")} />
            {weekDays.map((day) => {
              const holiday = publicHolidayDayOn(holidayDays, day);
              return (
                <div
                  key={day}
                  role="gridcell"
                  className="flex min-h-11 items-center justify-center px-1 py-1"
                >
                  {holiday ? (
                    <PublicHolidayMark
                      countries={holiday.countries}
                      titles={holiday.titles}
                      items={holiday.items}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              );
            })}
          </div>
          ) : null}

          {self ? (
            <div className={MATRIX} role="row">
              <MatrixName
                title={t("common.you")}
                subtitle={
                  <OrganizationWithFlag
                    organization={self.organization}
                    label={organizationLabel(self.organization, locale)}
                    locale={locale}
                  />
                }
                highlight
              />
              {weekDays.map((day) => {
                const person = weekSelfByYmd[day];
                return (
                  <PresenceStatusCell
                    key={day}
                    {...dayCellProps(
                      day,
                      today,
                      person,
                      locale,
                      intlLocale,
                      openLabel,
                      unsetLabel
                    )}
                    interactive
                    onClick={() => {
                      if (!person) return;
                      onOpenSelf(day, person);
                    }}
                  />
                );
              })}
            </div>
          ) : null}

          {colleagues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("presence.nobodyInFilter")}
            </p>
          ) : (
            colleagues.map((person) => (
              <div key={person.userId} className={MATRIX} role="row">
                <MatrixName
                  title={person.displayName}
                  subtitle={
                    <OrganizationWithFlag
                      organization={person.organization}
                      label={organizationLabel(person.organization, locale)}
                      locale={locale}
                    />
                  }
                />
                {weekDays.map((day) => {
                  const cell = (weekByYmd[day]?.people || []).find(
                    (row) => row.userId === person.userId
                  );
                  const canEdit = canOverridePerson(actor, person);
                  return (
                    <PresenceStatusCell
                      key={day}
                      {...dayCellProps(
                        day,
                        today,
                        cell ?? null,
                        locale,
                        intlLocale,
                        openLabel,
                        unsetLabel
                      )}
                      interactive={canEdit}
                      onClick={
                        canEdit
                          ? () => onOpenPerson(person, day)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
