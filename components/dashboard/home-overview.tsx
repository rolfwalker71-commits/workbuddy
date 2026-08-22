"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  ListChecks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MaringoLogo,
  MicrosoftLogo,
  MicrosoftPlannerLogo,
} from "@/components/branding/provider-logos";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { weekdayLabel } from "@/lib/utils/weekday";
import { cn } from "@/lib/utils";
import type { HomeOverviewPayload } from "@/lib/dashboard/home-overview";
import type { HomeTaskItem } from "@/lib/dashboard/home-tasks";

const ASIDE_WIDGET_CLASS =
  "rounded-2xl border border-border/70 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_3px_10px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_14px_rgba(0,0,0,0.28)]";

const MARI_DONUT_COLORS: Record<number, string> = {
  11: "#f43f5e",
  1: "#e86a2b",
  3: "#8b7cf6",
  13: "#22d3ee",
  6: "#eab308",
};

function formatLongDeDate(d = new Date()): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

function greetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

function FocusTile({
  href,
  eyebrow,
  title,
  detail,
  logo,
  icon: Icon,
}: {
  href: string;
  eyebrow: string;
  title: string;
  detail: string;
  logo?: ReactNode;
  icon?: typeof CalendarDays;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[7.5rem] flex-col justify-between rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        {logo ||
          (Icon ? (
            <Icon className="size-4 text-muted-foreground" strokeWidth={APP_ICON_STROKE} />
          ) : null)}
      </div>
      <div>
        <p className="break-words text-base font-semibold leading-snug">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
    </Link>
  );
}

function MariStatusDonut({
  segments,
  size = 100,
}: {
  segments: Array<{ statusId: number; label: string; count: number }>;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const stroke = Math.max(14, size * 0.18);
  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      </svg>
    );
  }
  let angle = 0;
  const arcs = segments.map((seg, i) => {
    const sweep = (seg.count / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const color =
      MARI_DONUT_COLORS[seg.statusId] ||
      ["#e86a2b", "#8b7cf6", "#eab308", "#38bdf8"][i % 4]!;
    const large = sweep > 180 ? 1 : 0;
    const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const sx = cx + r * Math.cos(rad(end));
    const sy = cy + r * Math.sin(rad(end));
    const ex = cx + r * Math.cos(rad(start));
    const ey = cy + r * Math.sin(rad(start));
    return (
      <path
        key={seg.statusId}
        d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 0 ${ex} ${ey}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="butt"
      />
    );
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {arcs}
    </svg>
  );
}

function TasksCard({ items }: { items: HomeTaskItem[] }) {
  const focus = items.slice(0, 6);
  return (
    <Card className={ASIDE_WIDGET_CLASS}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <MicrosoftPlannerLogo className="size-4" />
            Planner &amp; To Do
          </CardTitle>
          <Link
            href="/microsoft?tab=planner"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Öffnen
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {focus.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine offenen Aufgaben in den nächsten Tagen.</p>
        ) : (
          <ul className="space-y-2">
            {focus.map((task) => (
              <li key={task.key}>
                <Link
                  href={task.href || "/microsoft?tab=planner"}
                  className="flex items-start justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium leading-snug">
                      {task.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {task.accountLabel}
                      {task.bucketLabel ? ` · ${task.bucketLabel}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {task.overdue
                      ? "Überfällig"
                      : task.dueDate
                        ? weekdayLabel(task.dueDate)
                        : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeOverview() {
  const [data, setData] = useState<HomeOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/home/overview")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Übersicht laden fehlgeschlagen");
        setData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const nextEvent = useMemo(() => {
    const events = data?.microsoft?.events || [];
    return events.find((e) => !e.done) || events[0] || null;
  }, [data]);

  const mailSample = data?.microsoft?.mailInbox[0] || null;
  const tickets = data?.maringo?.tickets;
  const positiveCounts = (tickets?.countsByStatus || []).filter((c) => c.count > 0);

  return (
    <div className="space-y-6 pb-10">
      <header className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10 sm:p-6">
        <h1 className="text-[1.75rem] font-extrabold tracking-tight leading-snug">
          {greetingWord()}
          {data?.greetingName ? `, ${data.greetingName}` : ""}
        </h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {formatLongDeDate()}
        </p>
        {data && data.modules.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Dir sind noch keine Module zugewiesen. Bitte den Admin unter Einstellungen.
          </p>
        ) : null}
      </header>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Lade Übersicht…</p>
      ) : null}

      {data?.microsoft ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-tight">Microsoft 365</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <FocusTile
              href="/microsoft?tab=calendar"
              icon={CalendarDays}
              eyebrow="Nächster Termin"
              title={nextEvent?.subject || "Keine Termine"}
              detail={
                nextEvent
                  ? [nextEvent.startHm, nextEvent.location].filter(Boolean).join(" · ") ||
                    "Heute"
                  : data.microsoft.connected
                    ? "Kalender öffnen"
                    : "Microsoft verbinden"
              }
            />
            <FocusTile
              href="/microsoft?tab=mail"
              logo={<MicrosoftLogo className="size-5" />}
              eyebrow="Outlook Mail"
              title={mailSample?.subject || "Posteingang"}
              detail={
                mailSample
                  ? mailSample.from
                  : data.microsoft.connected
                    ? `${data.microsoft.mailInbox.length} Mails heute`
                    : "Microsoft verbinden"
              }
            />
            <FocusTile
              href="/microsoft?tab=mail&view=tagesanalysen"
              icon={ListChecks}
              eyebrow="Tagesanalyse"
              title={
                data.microsoft.mailDay?.headline ||
                (data.microsoft.mailDay
                  ? `${data.microsoft.mailDay.inboxCount} Posteingang`
                  : "Noch keine Analyse")
              }
              detail={
                data.microsoft.mailDay
                  ? `${data.microsoft.mailDay.inboxCount} rein · ${data.microsoft.mailDay.sentCount} raus`
                  : "Analyse im Microsoft-Tab starten"
              }
            />
          </div>

          {data.microsoft.events.length > 0 ? (
            <Card className={ASIDE_WIDGET_CLASS}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Heute im Kalender</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.microsoft.events.slice(0, 8).map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-start justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium leading-snug">
                          {ev.subject}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ev.isAllDay
                            ? "Ganztägig"
                            : [ev.startHm, ev.endHm].filter(Boolean).join("–")}
                          {ev.location ? ` · ${ev.location}` : ""}
                        </span>
                      </span>
                      {ev.done ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <TasksCard items={data.microsoft.tasks.items} />

          <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MicrosoftLogo className="size-3.5" />
              O365 {data.microsoft.connected ? "verbunden" : "nicht verbunden"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MicrosoftPlannerLogo className="size-3.5" />
              Planner/To Do{" "}
              {data.microsoft.tasks.hasMicrosoftScope ? "bereit" : "ohne Tasks-Scope"}
            </span>
            <Link href="/account" className="font-medium text-foreground hover:underline">
              Konto
            </Link>
          </p>
        </section>
      ) : null}

      {data?.maringo ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-tight">Maringo Support</h2>
          <Card className={ASIDE_WIDGET_CLASS}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <MaringoLogo className="size-5" />
                  Tickets von mir
                </CardTitle>
                <Link
                  href="/maringo"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline dark:text-orange-400"
                >
                  Zu Maringo
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>
              {tickets?.employeeNumber ? (
                <p className="text-xs text-muted-foreground">{tickets.employeeNumber}</p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {!tickets?.configured ? (
                <p className="text-sm text-muted-foreground">
                  Hinterlege dein Maringo-Login unter Konto.
                </p>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex min-w-[3.5rem] shrink-0 flex-col">
                    <span className="text-[2.5rem] font-black tabular-nums leading-none text-orange-600 dark:text-orange-400">
                      {tickets.total}
                    </span>
                    <span className="mt-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                      Gesamt
                    </span>
                  </div>
                  {positiveCounts.length > 0 ? (
                    <>
                      <MariStatusDonut segments={positiveCounts} />
                      <ul className="min-w-0 flex-1 space-y-1.5">
                        {positiveCounts.map((c, i) => (
                          <li
                            key={c.statusId}
                            className="flex items-center gap-2 border-b border-border/50 pb-1.5 last:border-b-0 last:pb-0"
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  MARI_DONUT_COLORS[c.statusId] ||
                                  ["#e86a2b", "#8b7cf6", "#eab308"][i % 3],
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {c.label}
                            </span>
                            <span className="text-sm font-bold tabular-nums">{c.count}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {tickets.lastPollAt
                        ? "Keine Tickets in den gewählten Status."
                        : "Noch kein Poll — Scheduler lädt gleich."}
                    </p>
                  )}
                </div>
              )}
              <Link
                href="/maringo"
                className="inline-flex h-11 items-center text-sm font-medium text-orange-600 hover:underline"
              >
                Meine offenen Tickets anzeigen
              </Link>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
