"use client";

import { useEffect, useState } from "react";
import { PublicHolidayMark } from "@/components/holidays/public-holiday-mark";
import { formatSwissDate } from "@/lib/utils/dates";
import { zurichYmd } from "@/lib/microsoft/time";
import { fetchPublicHolidayDays } from "@/lib/presence/public-holidays-client";
import {
  publicHolidayDayOn,
  publicHolidayLookaheadRange,
  type PublicHolidayDay,
} from "@/lib/presence/public-holidays-shared";
import { useT } from "@/components/i18n/locale-provider";

export function HomePublicHolidays() {
  const t = useT();
  const today = zurichYmd();
  const [days, setDays] = useState<PublicHolidayDay[]>([]);

  useEffect(() => {
    const range = publicHolidayLookaheadRange(today);
    let cancelled = false;
    void fetchPublicHolidayDays(range.from, range.to).then((next) => {
      if (!cancelled) setDays(next);
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const todayDay = publicHolidayDayOn(days, today);
  const upcoming = days.filter((d) => d.date > today).slice(0, 6);
  if (!todayDay && upcoming.length === 0) return null;

  return (
    <section className="rounded-2xl bg-violet-50 px-3 py-2.5 ring-1 ring-violet-200/80 dark:bg-violet-500/10 dark:ring-violet-400/25">
      {todayDay ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-violet-950 dark:text-violet-50">
            {t("home.holidayToday")}
          </p>
          <PublicHolidayMark
            countries={todayDay.countries}
            titles={todayDay.titles}
            items={todayDay.items}
            layout="inline"
          />
        </div>
      ) : (
        <p className="text-sm font-semibold text-violet-950 dark:text-violet-50">
          {t("home.nextHolidays")}
        </p>
      )}
      {upcoming.length > 0 ? (
        <ul className={todayDay ? "mt-2 space-y-1" : "mt-1.5 space-y-1"}>
          {upcoming.map((day) => (
            <li
              key={day.date}
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
            >
              <span className="font-medium text-violet-950 dark:text-violet-50">
                {formatSwissDate(day.date)}
              </span>
              <PublicHolidayMark
                countries={day.countries}
                titles={day.titles}
                items={day.items}
                layout="inline"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
