"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TranslatedPageHeader } from "@/components/layout/translated-page-header";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
  segmentedTriggerProps,
} from "@/components/layout/segmented-control";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";
import { mondayOfWeek } from "@/lib/presence/week";
import type { TechUpgradeEvent } from "@/lib/technik/tech-upgrades-calendar";
import { formatSwissDate, formatSwissDateRange } from "@/lib/utils/dates";
import { useAuth } from "@/components/auth/auth-provider";
import { useLocale, useT } from "@/components/i18n/locale-provider";

type BoardView = "day" | "week";

type EventsResponse = {
  from: string;
  to: string;
  mailbox: string;
  events: TechUpgradeEvent[];
  reason?: "no-reader" | "unreadable" | null;
  error?: string;
  technikDisabled?: boolean;
};

function weekDaysMonSun(ymd: string): string[] {
  const monday = mondayOfWeek(ymd);
  if (!monday) return [ymd];
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysYmd(monday, i));
}

function eventTimeLabel(event: TechUpgradeEvent, allDay: string): string {
  if (event.isAllDay) return allDay;
  const start = event.start.slice(11, 16);
  const end = event.end.slice(11, 16);
  if (start && end) return `${start}–${end}`;
  return start || allDay;
}

function formatLongDate(ymd: string, intl: string): string {
  return new Intl.DateTimeFormat(intl, {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${ymd}T12:00:00Z`));
}

export function TechnikCalendarBoard() {
  const t = useT();
  const { me } = useAuth();
  const { intlLocale } = useLocale();
  const hidden = me?.technikEnabled === false;
  const today = zurichYmd();
  const [view, setView] = useState<BoardView>("week");
  const [ymd, setYmd] = useState(today);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const days = useMemo(
    () => (view === "week" ? weekDaysMonSun(ymd) : [ymd]),
    [view, ymd]
  );
  const from = days[0];
  const to = days[days.length - 1];

  const load = useCallback(async (start: string, end: string) => {
    const res = await fetch(
      `/api/technik/events?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`
    );
    const json = (await res.json()) as EventsResponse;
    if (!res.ok) {
      if (json.technikDisabled) {
        throw new Error(t("technik.hidden"));
      }
      throw new Error(json.error || t("technik.loadFailed"));
    }
    setData(json);
  }, [t]);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        await load(from, to);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, hidden, load, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, TechUpgradeEvent[]>();
    for (const day of days) map.set(day, []);
    for (const event of data?.events || []) {
      const list = map.get(event.date);
      if (list) list.push(event);
    }
    return map;
  }, [data?.events, days]);

  const openEvent = (data?.events || []).find((e) => e.id === openId) ?? null;

  function shift(delta: number) {
    if (view === "week") {
      const monday = mondayOfWeek(ymd);
      if (!monday) return;
      setYmd(addDaysYmd(monday, delta * 7));
      return;
    }
    setYmd((prev) => addDaysYmd(prev, delta));
  }

  if (hidden) {
    return (
      <div className="space-y-6 pb-28 md:pb-0">
        <TranslatedPageHeader
          titleKey="technik.title"
          descriptionKey="technik.description"
          visual="technik"
        />
        <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10">
          <p className="text-sm font-medium text-foreground">
            {t("technik.hidden")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("technik.hiddenHint")}
          </p>
          <Link
            href="/account"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("nav.account")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      <TranslatedPageHeader
        titleKey="technik.title"
        descriptionKey="technik.description"
        visual="technik"
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
              view === "week" ? t("technik.previousWeek") : t("technik.previousDay")
            }
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold capitalize leading-snug">
              {view === "week"
                ? formatSwissDateRange(from, to)
                : formatLongDate(ymd, intlLocale)}
            </p>
            {data?.mailbox ? (
              <p className="text-xs text-muted-foreground">{data.mailbox}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={
              view === "week" ? t("technik.nextWeek") : t("technik.nextDay")
            }
            onClick={() => shift(1)}
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
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!data && !error ? (
        <p className="text-sm text-muted-foreground">{t("technik.loading")}</p>
      ) : null}
      {data?.reason === "no-reader" ? (
        <p className="text-sm text-muted-foreground">{t("technik.noReader")}</p>
      ) : null}
      {data?.reason === "unreadable" ? (
        <p className="text-sm text-muted-foreground">{t("technik.unreadable")}</p>
      ) : null}

      {data ? (
        <div className="space-y-4">
          {days.map((day) => {
            const events = byDay.get(day) || [];
            return (
              <section key={day} className="space-y-2">
                <h2
                  className={cn(
                    "text-sm font-bold capitalize leading-snug tracking-tight",
                    day === today && "text-primary"
                  )}
                >
                  {formatLongDate(day, intlLocale)}
                  <span className="ml-1.5 font-medium text-muted-foreground">
                    {events.length}
                  </span>
                </h2>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("technik.emptyDay")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {events.map((event) => (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => setOpenId(event.id)}
                          className={cn(
                            "flex min-h-11 w-full min-w-0 flex-col items-start gap-1 rounded-2xl px-3 py-2.5 text-left shadow-sm ring-1",
                            event.mayAffectInternal
                              ? "bg-amber-50 text-amber-950 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30"
                              : "bg-card ring-foreground/10"
                          )}
                        >
                          <span className="flex w-full min-w-0 items-start justify-between gap-2">
                            <span className="min-w-0 break-words text-sm font-semibold leading-snug">
                              {event.subject}
                            </span>
                            <span className="shrink-0 text-xs leading-snug opacity-80">
                              {eventTimeLabel(event, t("calendarUi.allDay"))}
                            </span>
                          </span>
                          {event.customerName ? (
                            <span className="break-words text-xs leading-snug">
                              {t("technik.customer")}: {event.customerName}
                            </span>
                          ) : null}
                          {event.systemsAffected.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                              {event.systemsAffected.map((system) => (
                                <span
                                  key={system}
                                  className="rounded-full bg-background/70 px-2 py-0.5 text-[0.7rem] leading-snug ring-1 ring-foreground/10"
                                >
                                  {system}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {event.mayAffectInternal ? (
                            <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold leading-snug">
                              <TriangleAlert
                                className="size-3.5"
                                strokeWidth={APP_ICON_STROKE}
                              />
                              {t("technik.internalRisk")}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      <Dialog
        open={Boolean(openEvent)}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words leading-snug">
              {openEvent?.subject}
            </DialogTitle>
            <DialogDescription className="break-words">
              {openEvent
                ? `${formatSwissDate(openEvent.date)} · ${eventTimeLabel(openEvent, t("calendarUi.allDay"))}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {openEvent ? (
            <div className="space-y-2 text-sm leading-snug">
              {openEvent.customerName ? (
                <p>
                  {t("technik.customer")}: {openEvent.customerName}
                </p>
              ) : null}
              {openEvent.systemsAffected.length > 0 ? (
                <p>
                  {t("technik.systems")}: {openEvent.systemsAffected.join(", ")}
                </p>
              ) : null}
              {openEvent.mayAffectInternal ? (
                <p className="font-semibold">{t("technik.internalRisk")}</p>
              ) : null}
              {openEvent.location ? (
                <p>
                  {t("technik.location")}: {openEvent.location}
                </p>
              ) : null}
              {openEvent.bodyPreview ? (
                <p className="break-words text-muted-foreground">
                  {openEvent.bodyPreview}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
