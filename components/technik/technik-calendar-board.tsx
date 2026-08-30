"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TranslatedPageHeader } from "@/components/layout/translated-page-header";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import { zurichYmd } from "@/lib/microsoft/time";
import type { TechUpgradeEvent } from "@/lib/technik/tech-upgrades-calendar";
import {
  addMonthsYmd,
  monthGridDays,
  sameCalendarMonth,
} from "@/lib/technik/month-grid";
import { formatSwissDate } from "@/lib/utils/dates";
import { useAuth } from "@/components/auth/auth-provider";
import { useLocale, useT } from "@/components/i18n/locale-provider";

const CELL_VISIBLE = 2;
const MEETING_NOISE = new Set(["teams", "outlook"]);

type EventsResponse = {
  from: string;
  to: string;
  mailbox: string;
  events: TechUpgradeEvent[];
  reason?: "no-reader" | "unreadable" | null;
  error?: string;
  technikDisabled?: boolean;
};

function eventTimeLabel(event: TechUpgradeEvent, allDay: string): string {
  if (event.isAllDay) return allDay;
  const start = event.start.slice(11, 16);
  const end = event.end.slice(11, 16);
  if (start && end) return `${start}–${end}`;
  return start || allDay;
}

function displaySystems(systems: string[]): string[] {
  return systems.filter((s) => !MEETING_NOISE.has(s.trim().toLowerCase()));
}

export function TechnikCalendarBoard() {
  const t = useT();
  const { me } = useAuth();
  const { intlLocale } = useLocale();
  const hidden = me?.technikEnabled === false;
  const today = zurichYmd();
  const [ymd, setYmd] = useState(today);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const days = useMemo(() => monthGridDays(ymd), [ymd]);
  const from = days[0];
  const to = days[days.length - 1];

  const load = useCallback(
    async (start: string, end: string) => {
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
    },
    [t]
  );

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
  const openSystems = openEvent ? displaySystems(openEvent.systemsAffected) : [];
  const weekdayLabels = useMemo(
    () =>
      days.slice(0, 7).map((day) =>
        new Intl.DateTimeFormat(intlLocale, {
          timeZone: "Europe/Zurich",
          weekday: "short",
        }).format(new Date(`${day}T12:00:00Z`))
      ),
    [days, intlLocale]
  );
  const monthTitle = new Intl.DateTimeFormat(intlLocale, {
    timeZone: "Europe/Zurich",
    month: "long",
    year: "numeric",
  }).format(new Date(`${ymd.slice(0, 7)}-01T12:00:00Z`));

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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10"
          aria-label={t("technik.previousMonth")}
          onClick={() => setYmd((prev) => addMonthsYmd(prev, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-semibold capitalize leading-snug">
            {monthTitle}
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
          aria-label={t("technik.nextMonth")}
          onClick={() => setYmd((prev) => addMonthsYmd(prev, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
        {!sameCalendarMonth(ymd, today) ? (
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
        <div className="overflow-x-auto">
          <div className="min-w-[56rem] overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
            <div className="grid grid-cols-7 border-b border-border">
              {weekdayLabels.map((label, i) => (
                <div
                  key={`${label}-${i}`}
                  className="px-2.5 py-2 text-xs font-semibold leading-snug text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const events = byDay.get(day) || [];
                const visible = events.slice(0, CELL_VISIBLE);
                const extra = events.length - visible.length;
                const inMonth = sameCalendarMonth(day, ymd);
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={cn(
                      "min-h-[8.5rem] border-b border-r border-border p-2 [&:nth-child(7n)]:border-r-0",
                      !inMonth && "bg-muted/40"
                    )}
                  >
                    <div
                      className={cn(
                        "mb-1.5 text-xs font-bold leading-none",
                        isToday &&
                          "inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                        !isToday && !inMonth && "text-muted-foreground",
                        !isToday && inMonth && "text-foreground"
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </div>
                    <div className="flex flex-col gap-1">
                      {visible.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => setOpenId(event.id)}
                          className={cn(
                            "w-full rounded-lg px-1.5 py-1 text-left leading-snug",
                            event.mayAffectInternal
                              ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30"
                              : "bg-muted text-foreground"
                          )}
                        >
                          <span className="block text-[0.7rem] font-bold">
                            {eventTimeLabel(event, t("calendarUi.allDay"))}
                          </span>
                          <span className="line-clamp-2 text-[0.7rem]">
                            {event.mayAffectInternal ? "⚠ " : ""}
                            {event.subject}
                          </span>
                        </button>
                      ))}
                      {extra > 0 ? (
                        <button
                          type="button"
                          onClick={() => setOpenId(events[CELL_VISIBLE].id)}
                          className="px-1 text-left text-[0.7rem] font-semibold leading-snug text-muted-foreground"
                        >
                          {t("technik.moreEvents", { count: extra })}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(openEvent)}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
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
              {openEvent.mayAffectInternal ? (
                <p className="inline-flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
                  <TriangleAlert
                    className="size-3.5 shrink-0"
                    strokeWidth={APP_ICON_STROKE}
                  />
                  {t("technik.internalRisk")}
                </p>
              ) : null}
              {openEvent.customerName ? (
                <p>
                  {t("technik.customer")}: {openEvent.customerName}
                </p>
              ) : null}
              {openSystems.length > 0 ? (
                <p>
                  {t("technik.systems")}: {openSystems.join(", ")}
                </p>
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
              {openEvent.webLink ? (
                <a
                  href={openEvent.webLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
                >
                  {t("mail.openInOutlook")}
                </a>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
