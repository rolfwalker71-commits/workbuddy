"use client";

import { PresenceStatusCell } from "@/components/presence/presence-status-cell";
import { PresenceStatusLegend } from "@/components/presence/presence-status-legend";
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
  subtitle?: string | null;
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
        <p className="break-words text-[0.7rem] leading-snug text-muted-foreground">
          {subtitle}
        </p>
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
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          className="min-w-[40rem] space-y-1.5"
          role="grid"
          aria-label={t("presence.yourWeek")}
        >
          <div className={MATRIX} role="row">
            <div />
            {weekDays.map((day) => {
              const isToday = day === today;
              const label = weekdayShort(day, intlLocale);
              return (
                <div
                  key={day}
                  role="columnheader"
                  className="flex min-h-10 items-center justify-center px-1"
                >
                  <span
                    className={cn(
                      "break-words px-2 py-1 text-xs font-bold leading-snug",
                      isToday &&
                        "rounded-full ring-2 ring-primary/70"
                    )}
                    aria-current={isToday ? "date" : undefined}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {self ? (
            <div className={MATRIX} role="row">
              <MatrixName
                title={t("common.you")}
                subtitle={organizationLabel(self.organization, locale)}
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
                  subtitle={organizationLabel(person.organization, locale)}
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
