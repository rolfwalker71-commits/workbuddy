"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  ExternalLink,
  ListChecks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GoogleLogo,
  GoogleTasksLogo,
  GmailLogo,
  MaringoLogo,
  MicrosoftLogo,
  MicrosoftPlannerLogo,
  MicrosoftToDoLogo,
  MicrosoftTeamsLogo,
  OutlookLogo,
} from "@/components/branding/provider-logos";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { formatSwissDate, formatSwissDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import {
  mergeHomeKpis,
  mergeHomeMaringoTickets,
  mergeHomeOverviewDetails,
  type HomeDetailsPayload,
  type HomeKpiLive,
  type HomeOverviewPayload,
  type HomeTicketSavedViewKpi,
} from "@/lib/dashboard/home-overview-shared";
import type { MariTicketsWatchState } from "@/lib/mari/sync-tickets-if-due";
import type { HomeTaskItem } from "@/lib/dashboard/home-tasks";
import {
  MS_TASK_DISPLAY_KEY,
  readMsTaskDisplayPrefs,
  writeMsTaskDisplayPrefs,
  type MsTaskDisplayPrefs,
} from "@/lib/microsoft/task-display-prefs";
import { HomeWeatherWidget } from "./home-weather-widget";
import { BagelHoleLabel } from "@/components/ui/bagel-hole-label";
import { EventArtCard } from "@/components/calendar/event-art-card";
import { EventDetailDialog } from "@/components/calendar/event-detail-dialog";
import { EventMariActions } from "@/components/calendar/event-mari-actions";
import { HomeDutyAbsenceBar } from "@/components/dashboard/home-duty-absence-bar";
import { HomeNextQueue } from "@/components/dashboard/home-next-queue";
import { buildHomeNextQueue } from "@/lib/dashboard/home-next-queue";
import { filterTodayEventsAfterGrace } from "@/lib/workspace/event-grace";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import type { WorkspaceTodayEvent } from "@/lib/workspace/merge-today";
import type {
  HomeTicketRow,
  HomeTtvDutyState,
} from "@/lib/dashboard/home-surfaces-shared";

const ASIDE_WIDGET_CLASS =
  "rounded-2xl border border-border/70 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_3px_10px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_14px_rgba(0,0,0,0.28)]";

const MARI_DONUT_COLORS: Record<number, string> = {
  11: "#f43f5e",
  1: "#e86a2b",
  3: "#8b7cf6",
  13: "#22d3ee",
  6: "#eab308",
  9: "#f59e0b",
  7: "#a78bfa",
  10: "#c084fc",
  4: "#fb923c",
  14: "#ef4444",
  15: "#38bdf8",
  16: "#34d399",
};

function mariDonutColor(statusId: number, index: number): string {
  return (
    MARI_DONUT_COLORS[statusId] ||
    ["#e86a2b", "#8b7cf6", "#eab308", "#38bdf8", "#34d399"][index % 5]!
  );
}

function polarDeg(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarDeg(cx, cy, r, endAngle);
  const end = polarDeg(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

function formatPollAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const swiss = formatSwissDateTime(iso);
  return swiss === "–" ? null : swiss;
}

const WAITING_ON_ME_STATUS = new Set([11, 1, 3, 13, 4, 14]);

const HERO_KPI_CLASS =
  "flex min-h-11 items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-sm ring-1 ring-foreground/10 transition-shadow hover:bg-muted hover:shadow-md";

function MailUnreadKpi({
  href,
  count,
  logo,
  caption,
}: {
  href: string;
  count: number | null;
  logo: ReactNode;
  caption: string;
}) {
  return (
    <Link
      href={href}
      className={HERO_KPI_CLASS}
      aria-label={
        count == null
          ? `Ungelesene ${caption}-Mails`
          : `${count} ungelesene ${caption}-Mails`
      }
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/15">
        {logo}
      </span>
      <span className="min-w-0">
        <span className="block text-[1.35rem] font-black tabular-nums leading-none tracking-tight">
          {count ?? "—"}
        </span>
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
          {caption} · Ungelesene Mails
        </span>
      </span>
    </Link>
  );
}

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
  const stroke = size >= 80 ? Math.max(14, size * 0.18) : Math.max(6, size * 0.16);
  const r = size >= 80 ? size / 2 - 10 : size / 2 - stroke / 2 - 1;
  if (total <= 0) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        aria-hidden
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      </svg>
    );
  }
  let angle = 0;
  const slices = segments.map((seg, i) => {
    const span = (seg.count / total) * 360;
    const startAngle = angle;
    const endAngle = i === segments.length - 1 ? 360 : angle + span;
    angle = endAngle;
    return {
      ...seg,
      color: mariDonutColor(seg.statusId, i),
      startAngle,
      endAngle,
      mid: (startAngle + endAngle) / 2,
      span: endAngle - startAngle,
    };
  });
  const showCounts = size >= 80;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block"
      role="img"
      aria-label="Ticket-Status"
    >
      {slices.map((s) => {
        const labelPos = polarDeg(cx, cy, r, s.mid);
        return (
          <g key={s.statusId}>
            <path
              d={donutArcPath(cx, cy, r, s.startAngle, s.endAngle)}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
            />
            {showCounts && s.span >= 24 ? (
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize={Math.max(9, size * 0.11)}
                fontWeight={700}
                className="tabular-nums"
              >
                {s.count}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function TaskGroupList({ items }: { items: HomeTaskItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Keine offenen Aufgaben in den nächsten Tagen.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((task) => (
        <li key={task.key}>
          <Link
            href={
              task.href ||
              (task.source === "google"
                ? "/google?tab=planner"
                : "/microsoft?tab=planner")
            }
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
                  ? formatSwissDate(task.dueDate)
                  : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TasksCard({
  items,
  showMicrosoft,
  showGoogle,
  display,
  onDisplayChange,
}: {
  items: HomeTaskItem[];
  showMicrosoft: boolean;
  showGoogle: boolean;
  display: MsTaskDisplayPrefs;
  onDisplayChange: (next: MsTaskDisplayPrefs) => void;
}) {
  const showPlanner = showMicrosoft && display.planner;
  const showTodo = showMicrosoft && display.todo;
  const planner = items.filter((t) => t.source === "planner").slice(0, 5);
  const todo = items.filter((t) => t.source === "todo").slice(0, 5);
  const google = items.filter((t) => t.source === "google").slice(0, 5);
  return (
    <Card className={ASIDE_WIDGET_CLASS}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {showMicrosoft ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={display.todo}
                onChange={(e) =>
                  onDisplayChange({ ...display, todo: e.target.checked })
                }
              />
              To Do
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={display.planner}
                onChange={(e) =>
                  onDisplayChange({ ...display, planner: e.target.checked })
                }
              />
              Planner
            </label>
          </div>
        ) : null}
        {showPlanner ? (
          <>
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <MicrosoftPlannerLogo className="size-4" />
                  Planner
                </h3>
                <Link
                  href="/microsoft?tab=planner"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Öffnen
                  <ChevronRight className="size-3.5" />
                </Link>
              </div>
              <TaskGroupList items={planner} />
            </section>
          </>
        ) : null}
        {showTodo ? (
          <>
            <section className={cn("space-y-2.5", showPlanner && "border-t border-border/60 pt-4")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <MicrosoftToDoLogo className="size-4" />
                  To Do
                </h3>
                <Link
                  href="/microsoft?tab=planner"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Öffnen
                  <ChevronRight className="size-3.5" />
                </Link>
              </div>
              <TaskGroupList items={todo} />
            </section>
          </>
        ) : null}
        {showGoogle ? (
          <section
            className={cn(
              "space-y-2.5",
              (showPlanner || showTodo) && "border-t border-border/60 pt-4"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-bold">
                <GoogleTasksLogo className="size-4" />
                Google Tasks
              </h3>
              <Link
                href="/google?tab=planner"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Öffnen
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
            <TaskGroupList items={google} />
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function HomeOverview() {
  const [data, setData] = useState<HomeOverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [taskDisplay, setTaskDisplay] = useState<MsTaskDisplayPrefs>({
    todo: true,
    planner: true,
  });
  const [zurichNow, setZurichNow] = useState(() => ({
    ymd: zurichYmd(),
    hm: zurichHm(),
  }));
  const [detailEvent, setDetailEvent] = useState<WorkspaceTodayEvent | null>(
    null
  );

  useEffect(() => {
    const sync = () => setTaskDisplay(readMsTaskDisplayPrefs());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(MS_TASK_DISPLAY_KEY, sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(MS_TASK_DISPLAY_KEY, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setZurichNow({ ymd: zurichYmd(), hm: zurichHm() });
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/home/overview");
        const json = (await res.json()) as HomeOverviewPayload & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error || "Übersicht laden fehlgeschlagen");
        }
        if (cancelled) return;
        setData(json);
        setLoading(false);
        setDetailsLoading(true);
        void fetch("/api/home/kpis")
          .then(async (kpiRes) => {
            if (!kpiRes.ok || cancelled) return;
            const kpis = (await kpiRes.json()) as HomeKpiLive;
            if (cancelled) return;
            setData((prev) => (prev ? mergeHomeKpis(prev, kpis) : prev));
          })
          .catch(() => undefined);
        if (json.maringo) {
          void fetch("/api/home/tickets")
            .then(async (ticketsRes) => {
              if (!ticketsRes.ok || cancelled) return;
              const live = (await ticketsRes.json()) as {
                tickets?: MariTicketsWatchState | null;
                ticketRows?: HomeTicketRow[];
                ttvInboxCount?: number;
                savedViews?: HomeTicketSavedViewKpi[];
              };
              if (cancelled) return;
              setData((prev) => {
                if (!prev?.maringo) return prev;
                if (live.tickets) {
                  return mergeHomeMaringoTickets(prev, live.tickets, {
                    ticketRows: live.ticketRows,
                    ttvInboxCount: live.ttvInboxCount,
                    savedViews: live.savedViews,
                  });
                }
                if (!live.savedViews) return prev;
                return {
                  ...prev,
                  maringo: {
                    ...prev.maringo,
                    savedViews: live.savedViews,
                  },
                };
              });
            })
            .catch(() => undefined);
        }
        const detailsRes = await fetch("/api/home/details");
        if (!detailsRes.ok || cancelled) return;
        const details = (await detailsRes.json()) as HomeDetailsPayload;
        if (cancelled) return;
        setData((prev) =>
          prev ? mergeHomeOverviewDetails(prev, details) : prev
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setDetailsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayEvents = useMemo(
    () =>
      filterTodayEventsAfterGrace(
        data?.todayEvents || [],
        zurichNow.ymd,
        zurichNow.hm
      ),
    [data?.todayEvents, zurichNow]
  );

  const mailSample =
    data?.todayMail[0] ||
    data?.microsoft?.mailInbox[0] ||
    data?.google?.mailInbox[0] ||
    null;
  const calendarHref =
    data?.google && !data.microsoft
      ? "/google?tab=calendar"
      : "/microsoft?tab=calendar";
  const mailHref =
    data?.google && !data.microsoft ? "/google?tab=mail" : "/microsoft?tab=mail";
  const analysisHref =
    data?.google && !data.microsoft
      ? "/google?tab=mail&view=tagesanalysen"
      : "/microsoft?tab=mail&view=tagesanalysen";
  const showTeamsCard = Boolean(
    data?.microsoft?.connected && data.microsoft.teamsEnabled !== false
  );
  const lastTeams = showTeamsCard
    ? data?.microsoft?.lastTeams ?? null
    : null;
  const teamsOpenCount = showTeamsCard
    ? data?.microsoft?.teamsOpenCount ?? null
    : null;
  const teamsHref = "/microsoft?tab=teams";
  const anyMailConnected = Boolean(
    data?.microsoft?.connected || data?.google?.connected
  );
  const showOutlookUnread = Boolean(data?.microsoft?.connected);
  const showGoogleUnread = Boolean(data?.google?.connected);
  const taskItems = [
    ...(data?.microsoft?.tasks.items || []),
    ...(data?.google && !data.microsoft ? data.google.tasks.items : []),
    ...(data?.microsoft && data?.google
      ? data.google.tasks.items.filter((t) => t.source === "google")
      : []),
  ];
  const uniqueTasks = Array.from(
    new Map(taskItems.map((t) => [t.key, t])).values()
  );
  const tickets = data?.maringo?.tickets;
  const nextQueue = useMemo(
    () =>
      buildHomeNextQueue({
        nowYmd: zurichNow.ymd,
        nowHm: zurichNow.hm,
        events: todayEvents,
        tickets: data?.maringo?.ticketRows || [],
        pendingStamps: data?.pendingStamps || [],
        tasks: uniqueTasks,
        ttvInboxCount: data?.maringo?.ttvInboxCount || 0,
        iAmTtv: Boolean(data?.ttvDuty?.isMe),
      }),
    [data, todayEvents, uniqueTasks, zurichNow]
  );
  const positiveCounts = (tickets?.countsByStatus || []).filter((c) => c.count > 0);
  const pollLabel = formatPollAt(tickets?.lastPollAt);
  const waitingOnMe = (tickets?.countsByStatus || [])
    .filter((c) => WAITING_ON_ME_STATUS.has(c.statusId))
    .reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-6 pb-10">
      <header className="@container relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-foreground/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/overview-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-white/92 via-white/78 to-white/45 dark:from-background/92 dark:via-background/72 dark:to-background/35"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-white/55 via-transparent to-sky-50/30 dark:from-background/70 dark:via-transparent dark:to-black/20"
          aria-hidden
        />
        <div className="relative space-y-4 px-5 py-6 sm:px-6 sm:py-7">
          <div className="flex flex-col gap-4 @[36rem]:flex-row @[36rem]:items-start @[36rem]:justify-between @[36rem]:gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.75rem] font-extrabold leading-snug tracking-tight drop-shadow-sm">
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
            </div>
            {loading && !data ? null : (
              <div className="w-full min-w-0 @[36rem]:w-[20rem] @[36rem]:shrink-0">
                <HomeWeatherWidget weather={data?.weather ?? null} />
              </div>
            )}
          </div>
          {data &&
          (showOutlookUnread || showGoogleUnread || data.maringo) ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
              {showOutlookUnread ? (
                <MailUnreadKpi
                  href="/microsoft?tab=mail"
                  count={data.microsoft?.unreadCount ?? null}
                  logo={<MicrosoftLogo className="size-5" title="Microsoft" />}
                  caption="Outlook"
                />
              ) : null}
              {showGoogleUnread ? (
                <MailUnreadKpi
                  href="/google?tab=mail"
                  count={data.google?.unreadCount ?? null}
                  logo={<GoogleLogo className="size-5" title="Google" />}
                  caption="Gmail"
                />
              ) : null}
              {data.maringo ? (
                <Link href="/maringo" className={HERO_KPI_CLASS}>
                  <span className="relative flex size-14 shrink-0 items-center justify-center">
                    <MariStatusDonut
                      segments={positiveCounts}
                      size={56}
                    />
                    <BagelHoleLabel className="text-sm font-black tabular-nums">
                      {tickets?.configured ? tickets.total : "—"}
                    </BagelHoleLabel>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug">
                      Tickets
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {!tickets?.configured
                        ? "Maringo unter Konto hinterlegen"
                        : waitingOnMe > 0
                          ? `${waitingOnMe} warten auf dich`
                          : tickets.total > 0
                            ? `${tickets.total} offen`
                            : tickets.lastPollAt
                              ? "Keine offenen Tickets"
                              : "Noch kein Poll"}
                    </span>
                  </span>
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <HomeDutyAbsenceBar
        ttvDuty={data?.ttvDuty ?? null}
        absence={data?.absence ?? null}
        onDutyChange={(next: HomeTtvDutyState) =>
          setData((prev) => (prev ? { ...prev, ttvDuty: next } : prev))
        }
      />

      <HomeNextQueue items={nextQueue} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Lade Übersicht…</p>
      ) : null}

      {data?.microsoft || data?.google ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-tight">
            {data.microsoft && data.google
              ? "Heute · Microsoft & Google"
              : data.google
                ? "Google Workspace"
                : "Microsoft 365"}
          </h2>
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              todayEvents.length === 0 && showTeamsCard
                ? "xl:grid-cols-4"
                : todayEvents.length === 0 || showTeamsCard
                  ? "xl:grid-cols-3"
                  : ""
            )}
          >
            {todayEvents.length === 0 ? (
              <FocusTile
                href={calendarHref}
                icon={CalendarDays}
                eyebrow="Kalender"
                title={
                  detailsLoading
                    ? "Termine werden geladen…"
                    : "Keine Termine"
                }
                detail={
                  detailsLoading
                    ? "Kalender"
                    : anyMailConnected
                      ? "Kalender öffnen"
                      : "Konto verbinden"
                }
              />
            ) : null}
            <FocusTile
              href={mailHref}
              logo={
                data.microsoft && data.google ? (
                  <span className="inline-flex items-center gap-1">
                    <OutlookLogo className="size-5" />
                    <GmailLogo className="size-5" />
                  </span>
                ) : data.google ? (
                  <GmailLogo className="size-5" />
                ) : (
                  <MicrosoftLogo className="size-5" />
                )
              }
              eyebrow={
                data.microsoft && data.google
                  ? "Posteingang"
                  : data.google
                    ? "Gmail"
                    : "Outlook Mail"
              }
              title={
                mailSample?.subject ||
                (detailsLoading ? "Mails werden geladen…" : "Posteingang")
              }
              detail={
                mailSample
                  ? mailSample.from
                  : detailsLoading
                    ? "Posteingang"
                    : anyMailConnected
                      ? `${data.todayMail.length} Mails heute`
                      : "Konto verbinden"
              }
            />
            <FocusTile
              href={analysisHref}
              icon={ListChecks}
              eyebrow="Tagesanalyse"
              title={
                data.microsoft?.mailDay?.headline ||
                data.google?.mailDay?.headline ||
                (data.microsoft?.mailDay || data.google?.mailDay
                  ? `${(data.microsoft?.mailDay || data.google?.mailDay)?.inboxCount} Posteingang`
                  : "Noch keine Analyse")
              }
              detail={
                data.microsoft?.mailDay || data.google?.mailDay
                  ? `${(data.microsoft?.mailDay || data.google?.mailDay)?.inboxCount} rein · ${(data.microsoft?.mailDay || data.google?.mailDay)?.sentCount} raus`
                  : "Analyse im Mail-Tab starten"
              }
            />
            {showTeamsCard ? (
              <FocusTile
                href={teamsHref}
                logo={<MicrosoftTeamsLogo className="size-5" />}
                eyebrow="Teams"
                title={
                  lastTeams?.preview ||
                  lastTeams?.title ||
                  (detailsLoading
                    ? "Nachricht wird geladen…"
                    : "Keine Nachricht")
                }
                detail={
                  lastTeams
                    ? [
                        lastTeams.title,
                        lastTeams.lastUpdatedAt
                          ? formatSwissDateTime(lastTeams.lastUpdatedAt)
                          : null,
                        teamsOpenCount != null
                          ? `${teamsOpenCount} offen`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : detailsLoading
                      ? "Teams"
                      : teamsOpenCount != null
                        ? `${teamsOpenCount} offen`
                        : "Teams öffnen"
                }
              />
            ) : null}
          </div>

          {todayEvents.length > 0 ? (
            <Card className={ASIDE_WIDGET_CLASS}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Heute im Kalender</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {todayEvents.slice(0, 8).map((ev) => (
                    <li
                      key={`${ev.provider}:${ev.calendarId || ""}:${ev.id}`}
                    >
                      <EventArtCard
                        event={ev}
                        onOpen={() => setDetailEvent(ev)}
                        footer={
                          ev.mari ? (
                            <EventMariActions
                              mari={ev.mari}
                              eventDate={ev.date}
                              endTime={ev.endTime}
                              time={ev.time}
                              isAllDay={ev.isAllDay}
                            />
                          ) : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
                <EventDetailDialog
                  event={detailEvent}
                  open={Boolean(detailEvent)}
                  onOpenChange={(next) => {
                    if (!next) setDetailEvent(null);
                  }}
                  actions={
                    detailEvent?.mari ? (
                      <EventMariActions
                        mari={detailEvent.mari}
                        eventDate={detailEvent.date}
                        endTime={detailEvent.endTime}
                        time={detailEvent.time}
                        isAllDay={detailEvent.isAllDay}
                      />
                    ) : undefined
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          <TasksCard
            items={uniqueTasks}
            showMicrosoft={Boolean(data.microsoft)}
            showGoogle={Boolean(data.google)}
            display={taskDisplay}
            onDisplayChange={(next) => {
              setTaskDisplay(next);
              writeMsTaskDisplayPrefs(next);
            }}
          />

          <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {data.microsoft ? (
              <span className="inline-flex items-center gap-1.5">
                <MicrosoftLogo className="size-3.5" />
                O365 {data.microsoft.connected ? "verbunden" : "nicht verbunden"}
              </span>
            ) : null}
            {data.google ? (
              <span className="inline-flex items-center gap-1.5">
                <GoogleLogo className="size-3.5" />
                Google {data.google.connected ? "verbunden" : "nicht verbunden"}
              </span>
            ) : null}
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
                  Hinterlege deine Personalnummer unter Konto.
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
                      <div className="shrink-0">
                        <MariStatusDonut segments={positiveCounts} size={100} />
                      </div>
                      <ul className="min-w-0 flex-1">
                        {positiveCounts.map((c, i) => {
                          const pct =
                            tickets.total > 0
                              ? ((c.count / tickets.total) * 100).toLocaleString(
                                  "de-CH",
                                  { maximumFractionDigits: 1 }
                                )
                              : "0";
                          return (
                            <li
                              key={c.statusId}
                              className="flex min-w-0 items-center gap-2 border-b border-border/50 py-0.5 last:border-b-0 last:pb-0"
                              title={`${c.label}: ${c.count}`}
                            >
                              <span
                                className="size-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: mariDonutColor(c.statusId, i) }}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 break-words text-xs font-medium leading-snug">
                                {c.label}
                              </span>
                              <span className="shrink-0 text-[0.8125rem] font-bold tabular-nums">
                                {c.count}
                              </span>
                              <span className="w-10 shrink-0 text-right text-[0.6875rem] tabular-nums text-muted-foreground">
                                {pct}%
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {tickets.lastPollAt
                        ? "Keine offenen Tickets."
                        : "Noch kein Poll — Scheduler lädt gleich."}
                    </p>
                  )}
                </div>
              )}
              {data.maringo.savedViews && data.maringo.savedViews.length > 0 ? (
                <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  Gespeicherte Sichten
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.maringo.savedViews.map((view) => (
                    <Link
                      key={view.id}
                      href={view.href}
                      className="rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 no-underline transition-colors hover:bg-muted"
                    >
                      <span className="block text-[0.6875rem] font-semibold leading-snug text-foreground">
                        {view.label}
                      </span>
                      <span className="mt-1 block text-xl font-black tabular-nums leading-none text-orange-600 dark:text-orange-400">
                        {view.count == null ? "—" : view.count}
                      </span>
                    </Link>
                  ))}
                </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href="/maringo"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-orange-600 hover:underline"
                >
                  Meine offenen Tickets anzeigen
                  <ExternalLink className="size-3.5" aria-hidden />
                </Link>
                <p className="text-[0.625rem] text-muted-foreground">
                  {pollLabel ? `Zuletzt geprüft: ${pollLabel}` : "Noch nicht geprüft"}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
