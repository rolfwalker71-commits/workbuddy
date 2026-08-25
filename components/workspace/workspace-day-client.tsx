"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CalendarClock,
  CalendarPlus,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  GmailLogo,
  GoogleLogo,
  GoogleTasksLogo,
  MicrosoftLogo,
  MicrosoftPlannerLogo,
  MicrosoftToDoLogo,
  OutlookLogo,
} from "@/components/branding/provider-logos";
import { PageHeader } from "@/components/layout/page-primitives";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { formatTokenUsageLine } from "@/lib/ai/usage-cost";
import type { AiTokenUsage } from "@/lib/ai/usage-cost";
import { toSwissDate } from "@/lib/utils/dates";
import {
  durationMinutesFromHm,
  groupFreeSlotsByDate,
  isSlotDurationPreset,
  SLOT_DURATION_PRESETS,
} from "@/lib/calendar/slot-duration";
import { weekdayLabel } from "@/lib/utils/weekday";
import { useAuth } from "@/components/auth/auth-provider";
import { AdhocEventDialog } from "@/components/calendar/adhoc-event-dialog";
import { EventArtCard } from "@/components/calendar/event-art-card";
import {
  EventDetailDialog,
  type EventEditValues,
} from "@/components/calendar/event-detail-dialog";
import { MicrosoftMailComposeDialog } from "@/components/microsoft/microsoft-mail-compose-dialog";
import { WorkspaceTasksPanel } from "@/components/workspace/workspace-tasks-panel";
import {
  mergeWorkspaceTodayEvents,
  toWorkspaceTodayEvent,
  workspaceEventKey,
  type WorkspaceProvider,
} from "@/lib/workspace/merge-today";
import { isDayCloseRitualId } from "@/lib/dashboard/day-close-ritual";
import { CLOSEOUT_OPEN_EVENT } from "@/components/closeout/closeout-assistant";
import { MailWorkspaceSubnav, type MailWorkspaceView, mailWorkspacePrimaryBtnClass, mailWorkspaceTabClass } from "@/components/mail/mail-workspace-subnav";
import { segmentedTrackClass } from "@/components/layout/segmented-control";
import {
  MailChronikList,
  MailChronikSummary,
  countMailsInRange,
  mergeMailChronik,
} from "@/components/mail/mail-chronik-list";
import { MailAnalysisThreadHint } from "@/components/mail/mail-analysis-thread-hint";
import { MailTagesanalysenList } from "@/components/mail/mail-tagesanalysen-list";
import { MailTriagePanel } from "@/components/mail/mail-triage-panel";
import {
  AnalysisEventDraftCard,
  analysisEventsNeedSlot,
} from "@/components/mail/analysis-event-draft-card";
import { summarizeMailThreadCoverage } from "@/lib/mail/mail-threads";
import type { MailDayCachedSummary } from "@/lib/mail/mail-day-cache-summary";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import {
  detectReplyLanguage,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";

function zurichYmdClient(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** ISO → `TT.MM.JJJJ, HH:MM` in Europe/Zurich. */
function toSwissDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return toSwissDate(iso);
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function addDaysYmdClient(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mailRangeKey(from: string, to: string): string {
  return `${from}_${to}`;
}

function formatMailRangeLabel(from: string, to: string): string {
  if (from === to) return toSwissDate(from);
  return `${toSwissDate(from)} – ${toSwissDate(to)}`;
}

/** Inclusive max 7 days; clamp Bis ≥ Von and ≤ today. */
function clampMailRange(from: string, to: string): { from: string; to: string } {
  const today = zurichYmdClient();
  let f = from;
  let t = to;
  if (t < f) t = f;
  const maxTo = addDaysYmdClient(f, 6);
  if (t > maxTo) t = maxTo;
  if (t > today) t = today;
  if (f > today) f = today;
  if (t < f) t = f;
  return { from: f, to: t };
}

type Tab = "calendar" | "mail" | "planner";

function parseTab(raw: string | null, _openId: string | null): Tab {
  if (raw === "calendar" || raw === "planner" || raw === "mail") {
    return raw;
  }
  if (raw === "inbox" || raw === "triage" || raw === "day") return "mail";
  return "mail";
}

function parseMailView(raw: string | null, tabRaw: string | null): MailWorkspaceView {
  if (raw === "chronik" || raw === "triage" || raw === "tagesanalysen") return raw;
  if (tabRaw === "triage") return "triage";
  if (tabRaw === "day") return "tagesanalysen";
  return "chronik";
}

type CloudProvider = "microsoft" | "google";

type WorkspaceCalEvent = {
  id: string;
  subject: string;
  startHm: string | null;
  endHm: string | null;
  endTime: string | null;
  date: string;
  location: string | null;
  isAllDay: boolean;
  done: boolean;
  webLink: string | null;
  provider: WorkspaceProvider;
  calendarId: string | null;
  title: string;
  time: string | null;
  planningRelevant: boolean;
  description: string | null;
  meetUrl: string | null;
  calendarType: string | null;
  calendarName: string | null;
};

function asCalEvent(e: {
  id: string;
  title: string;
  time: string | null;
  planningRelevant: boolean;
  provider: WorkspaceProvider;
  calendarId: string | null;
  date: string;
  endTime: string | null;
  location: string | null;
  isAllDay: boolean;
  done?: boolean;
  webLink?: string | null;
  description?: string | null;
  meetUrl?: string | null;
  calendarType?: string | null;
  calendarName?: string | null;
}): WorkspaceCalEvent {
  return {
    id: e.id,
    title: e.title,
    subject: e.title,
    time: e.time,
    startHm: e.time,
    endHm: e.endTime,
    endTime: e.endTime,
    planningRelevant: e.planningRelevant,
    provider: e.provider,
    calendarId: e.calendarId,
    date: e.date,
    location: e.location,
    isAllDay: e.isAllDay,
    done: Boolean(e.done),
    webLink: e.webLink ?? null,
    description: e.description ?? null,
    meetUrl: e.meetUrl ?? null,
    calendarType: e.calendarType ?? null,
    calendarName: e.calendarName ?? null,
  };
}

type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
};

type MsMail = MsMailItem & { provider: CloudProvider };

type DayTask = {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  sourceMailId?: string | null;
  sourceSubject?: string | null;
  folder?: "inbox" | "sent" | null;
  company?: string | null;
  counterpartEmail?: string | null;
  senderInitials?: string | null;
  theme?: string | null;
  reason?: string;
  existingTask?: {
    id: string;
    title: string;
    status: "open" | "done";
    doneAt?: string | null;
    href?: string | null;
    match?: "title" | "theme" | "notes";
    source?: "todo" | "planner" | "google" | null;
  } | null;
};

type DayEventSug = {
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  sourceMailId?: string | null;
  sourceSubject?: string | null;
  company?: string | null;
  counterpartEmail?: string | null;
  theme?: string | null;
  reason?: string;
  fromTaskTwin?: boolean;
};

type DayReplyTranslation = { subject: string; body: string };

type DayReply = {
  to: string;
  subject: string;
  body: string;
  language?: ReplyLang | null;
  sourceMailId?: string | null;
  company?: string | null;
  theme?: string | null;
  reason?: string;
  /** Cached DE/EN variants so the toggle can switch without a second API call. */
  translations?: Partial<Record<ReplyLang, DayReplyTranslation>>;
};

function currentReplyLang(r: DayReply): ReplyLang {
  if (r.language === "en" || r.language === "de") return r.language;
  return detectReplyLanguage(`${r.subject}\n${r.body}`);
}

function replyAtFlatIndex(
  analysis: DayAnalysis,
  flatIndex: number
): DayReply | undefined {
  const fromFlat = analysis.replies[flatIndex];
  if (fromFlat) return fromFlat;
  let n = 0;
  for (const cluster of analysis.clusters) {
    for (const reply of cluster.replies) {
      if (n === flatIndex) return reply;
      n += 1;
    }
  }
  return undefined;
}

function withReplyTranslation(
  reply: DayReply,
  next: DayReply,
  sourceLang: ReplyLang,
  targetLang: ReplyLang
): DayReply {
  return {
    ...reply,
    ...next,
    language: targetLang,
    translations: {
      ...reply.translations,
      [sourceLang]: { subject: reply.subject, body: reply.body },
      [targetLang]: { subject: next.subject, body: next.body },
    },
  };
}

function ReplyLangToggle({
  lang,
  busy,
  onChange,
}: {
  lang: ReplyLang;
  busy: boolean;
  onChange: (lang: ReplyLang) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Antwortsprache"
      className="inline-flex items-center gap-0.5 rounded-md border border-border/60 p-0.5"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {(["de", "en"] as const).map((code) => (
        <Button
          key={code}
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          aria-pressed={lang === code}
          className={cn(
            "rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase",
            lang === code
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(code);
          }}
        >
          {code}
        </Button>
      ))}
    </div>
  );
}

type DayCluster = {
  company: string;
  counterpartEmail?: string | null;
  theme: string;
  summary: string;
  status?: "open" | "waiting" | "done" | "fyi";
  /** false = nur Info / Chip «keine Aktion». */
  actionNeeded?: boolean;
  tasks: DayTask[];
  events: DayEventSug[];
  replies: DayReply[];
};

function clusterNeedsAction(cluster: DayCluster): boolean {
  if (typeof cluster.actionNeeded === "boolean") return cluster.actionNeeded;
  if (
    cluster.tasks.length > 0 ||
    cluster.events.length > 0 ||
    cluster.replies.length > 0
  ) {
    return true;
  }
  if (cluster.status === "open" || cluster.status === "waiting") return true;
  return false;
}

type DayAnalysis = {
  daySummary: string;
  clusters: DayCluster[];
  tasks: DayTask[];
  events: DayEventSug[];
  replies: DayReply[];
  usage?: AiTokenUsage | null;
};

type PickState = {
  tasks: Record<number, boolean>;
  events: Record<number, boolean>;
  replies: Record<number, boolean>;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  waiting: "Wartet",
  done: "Erledigt",
  fyi: "Info",
};

function tagMailProvider(
  items: MsMailItem[] | undefined,
  provider: CloudProvider
): MsMail[] {
  return ((items || []) as MsMailItem[]).map((m) => ({ ...m, provider }));
}

function mapTodayEvents(
  raw: unknown[],
  provider: CloudProvider
): WorkspaceCalEvent[] {
  return (raw || []).map((row) => {
    const e = row as Record<string, unknown>;
    const mapped = toWorkspaceTodayEvent({
      id: String(e.id || ""),
      subject: typeof e.subject === "string" ? e.subject : null,
      summary: typeof e.summary === "string" ? e.summary : null,
      startHm: typeof e.startHm === "string" ? e.startHm : null,
      time: typeof e.time === "string" ? e.time : null,
      endHm: typeof e.endHm === "string" ? e.endHm : null,
      endTime: typeof e.endTime === "string" ? e.endTime : null,
      planningRelevant:
        typeof e.planningRelevant === "boolean" ? e.planningRelevant : true,
      provider: isDayCloseRitualId(String(e.id || "")) ? "buddy" : provider,
      calendarId: typeof e.calendarId === "string" ? e.calendarId : null,
      date: typeof e.date === "string" ? e.date : "",
      location: typeof e.location === "string" ? e.location : null,
      isAllDay: Boolean(e.isAllDay),
      done: Boolean(e.done),
      webLink:
        typeof e.webLink === "string"
          ? e.webLink
          : typeof e.htmlLink === "string"
            ? e.htmlLink
            : null,
      description: typeof e.description === "string" ? e.description : null,
      meetUrl: typeof e.meetUrl === "string" ? e.meetUrl : null,
      calendarType: typeof e.calendarType === "string" ? e.calendarType : null,
      calendarName: typeof e.calendarName === "string" ? e.calendarName : null,
    });
    return asCalEvent(mapped);
  });
}

function EventDetailActions({
  event,
  busy,
  slotDuration,
  slots,
  onPreset,
  onDone,
  onSuggest,
  onReschedule,
}: {
  event: WorkspaceCalEvent;
  busy: boolean;
  slotDuration: number;
  slots: FreeSlot[];
  onPreset: (minutes: number) => void;
  onDone: () => void;
  onSuggest: () => void;
  onReschedule: (slot: FreeSlot) => void;
}) {
  if (isDayCloseRitualId(event.id)) {
    return (
      <Button
        type="button"
        size="sm"
        className="bg-orange-500 text-white hover:bg-orange-600"
        onClick={() => window.dispatchEvent(new Event(CLOSEOUT_OPEN_EVENT))}
      >
        <Sparkles className="size-3.5" />
        Assistent starten
      </Button>
    );
  }
  if (event.done) return null;
  return (
    <div className="space-y-2">
      <p className="text-[0.6875rem] text-muted-foreground">
        Dauer für Slot-Suche (kürzer = engere Lücken)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SLOT_DURATION_PRESETS.map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            variant={slotDuration === m ? "default" : "outline"}
            className="h-7 tabular-nums"
            disabled={busy}
            onClick={() => onPreset(m)}
          >
            {m} Min
          </Button>
        ))}
        {!isSlotDurationPreset(slotDuration) ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-7 tabular-nums"
            disabled={busy}
          >
            {slotDuration} Min
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onDone}>
          <Check className="size-3.5" />
          Erledigt
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onSuggest}
        >
          Freien Slot suchen
        </Button>
      </div>
      {slots.length ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Vorschläge à {slotDuration} Min (7 Tage, 08–18)
          </p>
          <div className="max-h-64 space-y-2.5 overflow-y-auto">
            {groupFreeSlotsByDate(slots).map(({ date, slots: daySlots }) => (
              <div key={date} className="space-y-1">
                <p className="text-xs font-semibold">
                  {weekdayLabel(date)} · {toSwissDate(date)}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {daySlots.map((s) => (
                    <li key={`${s.date}-${s.startHm}`}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onReschedule(s)}
                      >
                        {s.startHm}–{s.endHm}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceDayClient({
  providerScope,
}: {
  providerScope?: CloudProvider;
} = {}) {
  const searchParams = useSearchParams();
  const pathname = usePathname() || "";
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const modules = me?.modules ?? [];
  const scope: CloudProvider =
    providerScope ??
    (pathname.startsWith("/google") ? "google" : "microsoft");
  const wantMs = scope === "microsoft" && modules.includes("microsoft");
  const wantGoogle = scope === "google" && modules.includes("google");
  const routeHint = scope;

  const [tab, setTab] = useState<Tab>(() =>
    parseTab(searchParams.get("tab"), searchParams.get("open"))
  );
  const [mailView, setMailView] = useState<MailWorkspaceView>(() =>
    parseMailView(searchParams.get("view"), searchParams.get("tab"))
  );
  const [openMailId, setOpenMailId] = useState<string | null>(
    () => searchParams.get("open")
  );
  const [msConnected, setMsConnected] = useState<boolean | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [msEmail, setMsEmail] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [analysisProvider, setAnalysisProvider] = useState<CloudProvider>(
    routeHint
  );

  const [events, setEvents] = useState<WorkspaceCalEvent[]>([]);
  const [detailEvent, setDetailEvent] = useState<WorkspaceCalEvent | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [slotsByEvent, setSlotsByEvent] = useState<Record<string, FreeSlot[]>>(
    {}
  );
  const [slotDurationByEvent, setSlotDurationByEvent] = useState<
    Record<string, number>
  >({});

  const [inbox, setInbox] = useState<MsMail[]>([]);
  const [sent, setSent] = useState<MsMail[]>([]);
  const [mailFrom, setMailFrom] = useState(() => zurichYmdClient());
  const [mailTo, setMailTo] = useState(() => zurichYmdClient());
  const [mailLoading, setMailLoading] = useState(false);
  const [triagePending, setTriagePending] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeNotice, setAnalyzeNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);
  const [showAllThreads, setShowAllThreads] = useState(false);
  const [cachedDays, setCachedDays] = useState<string[]>([]);
  const [cachedEntries, setCachedEntries] = useState<MailDayCachedSummary[]>(
    []
  );
  const [analysisFromCache, setAnalysisFromCache] = useState(false);
  const [picks, setPicks] = useState<PickState>({
    tasks: {},
    events: {},
    replies: {},
  });
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftTasks, setDraftTasks] = useState<DayTask[]>([]);
  const [draftEvents, setDraftEvents] = useState<DayEventSug[]>([]);
  const [draftReplies, setDraftReplies] = useState<DayReply[]>([]);
  const [sendReplies, setSendReplies] = useState(false);
  const [composeNewOpen, setComposeNewOpen] = useState(false);
  const [translatingReply, setTranslatingReply] = useState<string | null>(
    null
  );
  const pollRef = useRef<number | null>(null);

  const loadConnection = useCallback(async () => {
    try {
      const fetches: Promise<void>[] = [];
      if (wantMs) {
        fetches.push(
          fetch("/api/microsoft/connection")
            .then(async (res) => {
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Microsoft-Status fehlgeschlagen");
              setMsConnected(Boolean(json.connected));
              setMsEmail(json.connectedEmail || null);
            })
            .catch((err) => {
              setMsConnected(false);
              setError(err instanceof Error ? err.message : String(err));
            })
        );
      } else {
        setMsConnected(false);
      }
      if (wantGoogle) {
        fetches.push(
          fetch("/api/google/connection")
            .then(async (res) => {
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Google-Status fehlgeschlagen");
              setGoogleConnected(Boolean(json.connected));
              setGoogleEmail(json.connectedEmail || null);
            })
            .catch((err) => {
              setGoogleConnected(false);
              setError(err instanceof Error ? err.message : String(err));
            })
        );
      } else {
        setGoogleConnected(false);
      }
      await Promise.all(fetches);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [wantMs, wantGoogle]);

  const loadTriagePending = useCallback(async () => {
    const url =
      scope === "google"
        ? "/api/google/mail/triage?sync=0"
        : "/api/microsoft/mail/triage?sync=0";
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) return;
      setTriagePending(Number(json.pendingCount) || 0);
    } catch {
      /* badge is optional */
    }
  }, [scope]);

  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    setError(null);
    try {
      const fetches: Promise<WorkspaceCalEvent[]>[] = [];
      if (msConnected) {
        fetches.push(
          fetch("/api/microsoft/calendar/today")
            .then(async (res) => {
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Outlook-Kalender fehlgeschlagen");
              return mapTodayEvents((json.events || []) as unknown[], "microsoft");
            })
            .catch((err) => {
              setError(err instanceof Error ? err.message : String(err));
              return [] as WorkspaceCalEvent[];
            })
        );
      }
      if (googleConnected) {
        fetches.push(
          fetch("/api/google/calendar/today")
            .then(async (res) => {
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Google-Kalender fehlgeschlagen");
              return mapTodayEvents((json.events || []) as unknown[], "google");
            })
            .catch((err) => {
              setError(err instanceof Error ? err.message : String(err));
              return [] as WorkspaceCalEvent[];
            })
        );
      }
      const groups = await Promise.all(fetches);
      setEvents(mergeWorkspaceTodayEvents(...groups).map(asCalEvent));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCalLoading(false);
    }
  }, [msConnected, googleConnected]);

  const loadMail = useCallback(async (from?: string, to?: string) => {
    const clamped = clampMailRange(from || mailFrom, to || mailTo);
    setMailLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        from: clamped.from,
        to: clamped.to,
      });
      const fetches: Promise<{ inbox: MsMail[]; sent: MsMail[]; fromYmd?: string; toYmd?: string }>[] = [];
      if (msConnected) {
        fetches.push(
          fetch(`/api/microsoft/mail/today?${qs}`).then(async (res) => {
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Outlook-Mails fehlgeschlagen");
            return {
              inbox: tagMailProvider(json.inbox, "microsoft"),
              sent: tagMailProvider(json.sent, "microsoft"),
              fromYmd: json.fromYmd as string | undefined,
              toYmd: json.toYmd as string | undefined,
            };
          })
        );
      }
      if (googleConnected) {
        fetches.push(
          fetch(`/api/google/mail/today?${qs}`).then(async (res) => {
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gmail fehlgeschlagen");
            return {
              inbox: tagMailProvider(json.inbox, "google"),
              sent: tagMailProvider(json.sent, "google"),
              fromYmd: json.fromYmd as string | undefined,
              toYmd: json.toYmd as string | undefined,
            };
          })
        );
      }
      const parts = await Promise.all(
        fetches.map((p) =>
          p.catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
            return {
              inbox: [] as MsMail[],
              sent: [] as MsMail[],
              fromYmd: undefined as string | undefined,
              toYmd: undefined as string | undefined,
            };
          })
        )
      );
      setInbox(parts.flatMap((p) => p.inbox));
      setSent(parts.flatMap((p) => p.sent));
      const fromHit = parts.find((p) => p.fromYmd)?.fromYmd;
      const toHit = parts.find((p) => p.toYmd)?.toYmd;
      if (fromHit) setMailFrom(fromHit);
      if (toHit) setMailTo(toHit);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMailLoading(false);
    }
  }, [mailFrom, mailTo, msConnected, googleConnected]);

  useEffect(() => {
    if (authLoading) return;
    void loadConnection();
  }, [authLoading, loadConnection]);

  const anyConnected = Boolean(msConnected || googleConnected);
  const connectionReady =
    !authLoading && msConnected !== null && googleConnected !== null;

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setTab(parseTab(t, searchParams.get("open")));
    setMailView(parseMailView(searchParams.get("view"), t));
  }, [searchParams]);

  const replaceQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  function goTab(next: Tab) {
    setTab(next);
    if (next === "mail") {
      replaceQuery({ tab: "mail", review: null });
      return;
    }
    replaceQuery({
      tab: next,
      view: null,
      review: next === "calendar" ? searchParams.get("review") : null,
    });
  }

  function goMailView(next: MailWorkspaceView) {
    setMailView(next);
    replaceQuery({ tab: "mail", view: next, review: null });
  }

  useEffect(() => {
    if (anyConnected) {
      void loadCalendar();
      void loadMail(mailFrom, mailTo);
      void loadTriagePending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load when connected
  }, [anyConnected]);

  useEffect(() => {
    if (routeHint === "google" && googleConnected) {
      setAnalysisProvider("google");
    } else if (routeHint === "microsoft" && msConnected) {
      setAnalysisProvider("microsoft");
    } else if (msConnected) {
      setAnalysisProvider("microsoft");
    } else if (googleConnected) {
      setAnalysisProvider("google");
    }
  }, [routeHint, msConnected, googleConnected]);

  const visibleEvents = events;

  const openEvents = useMemo(
    () => visibleEvents.filter((e) => !e.done && !isDayCloseRitualId(e.id)),
    [visibleEvents]
  );
  const reviewMode = searchParams.get("review") === "1";
  const firstOpenKey = openEvents[0]
    ? workspaceEventKey(openEvents[0])
    : null;

  useEffect(() => {
    if (!reviewMode || tab !== "calendar" || !firstOpenKey) return;
    const el = document.getElementById(`cal-review-${firstOpenKey}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [reviewMode, tab, firstOpenKey]);

  const mailThreadCoverage = useMemo(
    () => summarizeMailThreadCoverage(inbox, sent),
    [inbox, sent]
  );

  function eventActionUrl(provider: CloudProvider): string {
    return provider === "google"
      ? "/api/google/calendar/actions"
      : "/api/microsoft/calendar/actions";
  }

  function cloudProviderOf(
    event: WorkspaceCalEvent
  ): CloudProvider | null {
    if (event.provider === "buddy" || isDayCloseRitualId(event.id)) {
      return null;
    }
    return event.provider;
  }

  async function markDone(event: WorkspaceCalEvent) {
    if (isDayCloseRitualId(event.id)) {
      window.dispatchEvent(new Event(CLOSEOUT_OPEN_EVENT));
      return;
    }
    const key = workspaceEventKey(event);
    setBusyId(key);
    setError(null);
    try {
      const cloud = cloudProviderOf(event);
      if (!cloud) return;
      const res = await fetch(eventActionUrl(cloud), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "done",
          eventId: event.id,
          calendarId: event.calendarId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Markieren fehlgeschlagen");
      setStatus("Als erledigt markiert (Buddy/Erledigt).");
      setDetailEvent(null);
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function slotDurationFor(e: WorkspaceCalEvent): number {
    return (
      slotDurationByEvent[workspaceEventKey(e)] ??
      durationMinutesFromHm(e.startHm, e.endHm)
    );
  }

  async function suggestSlots(event: WorkspaceCalEvent, durationMinutes?: number) {
    if (isDayCloseRitualId(event.id)) {
      window.dispatchEvent(new Event(CLOSEOUT_OPEN_EVENT));
      return;
    }
    const key = workspaceEventKey(event);
    const duration = durationMinutes ?? slotDurationFor(event);
    setSlotDurationByEvent((prev) => ({ ...prev, [key]: duration }));
    setBusyId(key);
    setError(null);
    try {
      const cloud = cloudProviderOf(event);
      if (!cloud) return;
      const res = await fetch(eventActionUrl(cloud), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest_slots",
          eventId: event.id,
          calendarId: event.calendarId || undefined,
          durationMinutes: duration,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Slots fehlgeschlagen");
      setSlotsByEvent((prev) => ({
        ...prev,
        [key]: (json.slots || []) as FreeSlot[],
      }));
      if (!(json.slots || []).length) {
        setStatus(
          `Keine freien Slots à ${duration} Min in den nächsten 7 Tagen (08–18).`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reschedule(event: WorkspaceCalEvent, slot: FreeSlot) {
    if (isDayCloseRitualId(event.id)) return;
    const key = workspaceEventKey(event);
    setBusyId(key);
    setError(null);
    try {
      const cloud = cloudProviderOf(event);
      if (!cloud) return;
      const res = await fetch(eventActionUrl(cloud), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          eventId: event.id,
          calendarId: event.calendarId || undefined,
          date: slot.date,
          startHm: slot.startHm,
          endHm: slot.endHm,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Verschieben fehlgeschlagen");
      setDetailEvent(null);
      setStatus(
        `Verschoben auf ${toSwissDate(slot.date)} ${slot.startHm}–${slot.endHm}`
      );
      setSlotsByEvent((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function saveEvent(event: WorkspaceCalEvent, values: EventEditValues) {
    if (isDayCloseRitualId(event.id)) return;
    const key = workspaceEventKey(event);
    setBusyId(key);
    setError(null);
    try {
      const cloud = cloudProviderOf(event);
      if (!cloud) return;
      if (!values.title.trim() || !values.date) {
        throw new Error("Titel und Datum sind nötig.");
      }
      if (cloud === "google" && !event.calendarId) {
        throw new Error("Kalender-ID fehlt — Termin kann nicht gespeichert werden.");
      }
      const res = await fetch(eventActionUrl(cloud), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          eventId: event.id,
          calendarId: event.calendarId || undefined,
          title: values.title.trim(),
          date: values.date,
          startHm: values.isAllDay ? null : values.time,
          endHm: values.isAllDay ? null : values.endTime,
          allDay: values.isAllDay,
          location: values.location || null,
          notes: values.description || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setStatus("Termin gespeichert.");
      setDetailEvent(null);
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function mailApi(provider: CloudProvider, path: string): string {
    return provider === "google" ? `/api/google/mail/${path}` : `/api/microsoft/mail/${path}`;
  }

  const applyAnalysisPayload = useCallback(
    (
      a: DayAnalysis,
      dayLabel: string,
      finishedAt?: string | null,
      opts?: { fromCache?: boolean }
    ) => {
      const clusters = a.clusters || [];
      const replies =
        a.replies?.length > 0
          ? a.replies
          : clusters.flatMap((c) => c.replies);
      setAnalysis({
        daySummary: a.daySummary || "",
        clusters,
        tasks: a.tasks || [],
        events: a.events || [],
        replies,
        usage: a.usage || null,
      });
      setShowAllThreads(false);
      const next: PickState = { tasks: {}, events: {}, replies: {} };
      (a.tasks || []).forEach((t, i) => {
        // Bereits in To Do → nicht erneut übernehmen (erledigt = OK).
        next.tasks[i] = !t.existingTask?.id;
      });
      (a.events || []).forEach((_, i) => {
        next.events[i] = true;
      });
      replies.forEach((_, i) => {
        next.replies[i] = true;
      });
      setPicks(next);
      setAnalysisFromCache(Boolean(opts?.fromCache));
      const when = finishedAt
        ? toSwissDateTime(finishedAt)
        : toSwissDate(dayLabel);
      const usageLine = formatTokenUsageLine(a.usage);
      const prefix = opts?.fromCache
        ? `Gespeicherte Analyse (${when})`
        : `Analyse fertig (${when})`;
      setAnalyzeNotice(
        [
          `${prefix}: ${(a.clusters || []).length} Cluster, ${(a.tasks || []).length} Aufgabe(n), ${(a.replies || []).length} Antwort(en).`,
          usageLine,
        ]
          .filter(Boolean)
          .join(" ")
      );
      setTab("mail");
      setMailView("tagesanalysen");
      replaceQuery({ tab: "mail", view: "tagesanalysen", review: null });
    },
    [replaceQuery]
  );

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const hydrateFromJob = useCallback(
    (
      job: {
        status: string;
        dayIso: string;
        fromYmd?: string;
        toYmd?: string;
        rangeKey?: string;
        finishedAt?: string | null;
        error?: string | null;
        mail?: { inbox?: MsMail[]; sent?: MsMail[]; dayIso?: string } | null;
        analysis?: DayAnalysis | null;
      },
      opts?: { syncDay?: boolean; fromCache?: boolean }
    ) => {
      const syncDay = Boolean(opts?.syncDay);
      const fromYmd = job.fromYmd || job.dayIso;
      const toYmd = job.toYmd || job.dayIso;
      const label = formatMailRangeLabel(fromYmd, toYmd);
      if (job.mail) {
        setInbox((job.mail.inbox || []) as MsMail[]);
        setSent((job.mail.sent || []) as MsMail[]);
      }
      if (job.status === "running") {
        setAnalyzing(true);
        setAnalysisFromCache(false);
        setAnalyzeNotice(`Analyse für ${label} läuft im Hintergrund (inkl. vollständiger Threads)…`);
        if (syncDay && fromYmd && toYmd) {
          setMailFrom(fromYmd);
          setMailTo(toYmd);
        }
        return;
      }
      if (job.status === "done" && job.analysis) {
        setAnalyzing(false);
        if (syncDay && fromYmd && toYmd) {
          setMailFrom(fromYmd);
          setMailTo(toYmd);
        }
        applyAnalysisPayload(job.analysis, label, job.finishedAt, {
          fromCache: opts?.fromCache,
        });
        return;
      }
      if (job.status === "error") {
        setAnalyzing(false);
        setAnalysisFromCache(false);
        setError(job.error || "Analyse fehlgeschlagen");
        setAnalyzeNotice(null);
      }
    },
    [applyAnalysisPayload]
  );

  const mergeCachedFromJson = useCallback(
    (
      primary: MailDayCachedSummary[] | undefined,
      extra?: MailDayCachedSummary[]
    ) => {
      const tagged = (primary || []).map((e) => ({
        ...e,
        provider: e.provider || analysisProvider,
      }));
      const more = (extra || []).map((e) => ({
        ...e,
        provider:
          e.provider ||
          (analysisProvider === "google" ? "microsoft" : "google"),
      }));
      const all = [...tagged, ...more].sort((a, b) =>
        b.finishedAt.localeCompare(a.finishedAt)
      );
      setCachedEntries(all);
      setCachedDays(all.map((e) => e.rangeKey));
    },
    [analysisProvider]
  );

  const pollJobOnce = useCallback(async () => {
    const key = mailRangeKey(mailFrom, mailTo);
    try {
      const qs = new URLSearchParams({ from: mailFrom, to: mailTo });
      const res = await fetch(`${mailApi(analysisProvider, "analyze")}?${qs}`);
      const json = await res.json();
      if (!res.ok) return json.status as string | undefined;
      mergeCachedFromJson(json.cachedEntries);
      if (json.job) {
        const jobKey =
          json.job.rangeKey ||
          mailRangeKey(json.job.fromYmd || json.job.dayIso, json.job.toYmd || json.job.dayIso);
        hydrateFromJob(json.job, {
          syncDay: jobKey === key || json.status === "running",
          fromCache: false,
        });
      }
      if (json.status === "done" || json.status === "error" || json.status === "idle") {
        stopPoll();
        if (json.status !== "running") setAnalyzing(false);
      }
      return json.status as string;
    } catch {
      return undefined;
    }
  }, [analysisProvider, hydrateFromJob, mailFrom, mailTo, mergeCachedFromJson, stopPoll]);

  const startPolling = useCallback(() => {
    stopPoll();
    void pollJobOnce();
    pollRef.current = window.setInterval(() => {
      void pollJobOnce();
    }, 2500);
  }, [pollJobOnce, stopPoll]);

  const loadAnalysisForRange = useCallback(
    async (from: string, to: string) => {
      const clamped = clampMailRange(from, to);
      const key = mailRangeKey(clamped.from, clamped.to);
      try {
        const qs = new URLSearchParams({
          from: clamped.from,
          to: clamped.to,
        });
        const res = await fetch(`${mailApi(analysisProvider, "analyze")}?${qs}`);
        const json = await res.json();
        if (!res.ok) return;
        mergeCachedFromJson(json.cachedEntries);

        if (json.status === "running") {
          const jobKey =
            json.job?.rangeKey ||
            (json.job?.dayIso
              ? mailRangeKey(
                  json.job.fromYmd || json.job.dayIso,
                  json.job.toYmd || json.job.dayIso
                )
              : null);
          if (jobKey === key) {
            hydrateFromJob(json.job, { syncDay: false });
            startPolling();
            return;
          }
          if (json.cachedJob?.analysis) {
            hydrateFromJob(json.cachedJob, {
              syncDay: false,
              fromCache: true,
            });
            return;
          }
          setAnalysis(null);
          setAnalyzeNotice(
            `Analyse für ${formatMailRangeLabel(
              json.job?.fromYmd || json.job?.dayIso || "",
              json.job?.toYmd || json.job?.dayIso || ""
            )} läuft noch — dieser Zeitraum hat keine gespeicherte Analyse.`
          );
          setAnalysisFromCache(false);
          setPicks({ tasks: {}, events: {}, replies: {} });
          return;
        }

        if (json.status === "done" && json.job?.analysis) {
          hydrateFromJob(json.job, {
            syncDay: false,
            fromCache: Boolean(json.fromCache),
          });
          return;
        }

        setAnalysis(null);
        setAnalyzeNotice(null);
        setAnalysisFromCache(false);
        setPicks({ tasks: {}, events: {}, replies: {} });
      } catch {
        /* ignore */
      }
    },
    [analysisProvider, hydrateFromJob, mergeCachedFromJson, startPolling]
  );

  useEffect(() => {
    return () => stopPoll();
  }, [stopPoll]);

  // Einmalig nach Connect: letzten Job wiederherstellen
  useEffect(() => {
    if (!anyConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const providers: CloudProvider[] = [];
        if (msConnected) providers.push("microsoft");
        if (googleConnected) providers.push("google");
        const results = await Promise.all(
          providers.map(async (p) => {
            const res = await fetch(mailApi(p, "analyze"));
            const json = await res.json();
            return { p, ok: res.ok, json };
          })
        );
        if (cancelled) return;
        const entries = results.flatMap(({ p, ok, json }) =>
          ok && Array.isArray(json.cachedEntries)
            ? (json.cachedEntries as MailDayCachedSummary[]).map((e) => ({
                ...e,
                provider: e.provider || p,
              }))
            : []
        );
        entries.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
        setCachedEntries(entries);
        setCachedDays(entries.map((e) => e.rangeKey));
        const preferred =
          results.find((r) => r.p === analysisProvider && r.ok && r.json.job) ||
          results.find((r) => r.ok && r.json.job);
        if (!preferred) return;
        hydrateFromJob(preferred.json.job, {
          syncDay: true,
          fromCache: Boolean(preferred.json.fromCache),
        });
        if (preferred.json.status === "running") startPolling();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyConnected]);

  function startAnalyze() {
    const clamped = clampMailRange(mailFrom, mailTo);
    setMailFrom(clamped.from);
    setMailTo(clamped.to);
    setError(null);
    setStatus(null);
    setAnalyzing(true);
    setAnalyzeNotice(
      `Analyse für ${formatMailRangeLabel(clamped.from, clamped.to)} läuft im Hintergrund (inkl. vollständiger Threads)…`
    );
    void (async () => {
      try {
        const res = await fetch(mailApi(analysisProvider, "analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: clamped.from, to: clamped.to }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Analyse starten fehlgeschlagen");
        mergeCachedFromJson(json.cachedEntries);
        if (json.job) hydrateFromJob(json.job, { fromCache: false });
        startPolling();
      } catch (err) {
        setAnalyzing(false);
        setAnalyzeNotice(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }

  function openConfirm() {
    if (!analysis) return;
    const tasks = analysis.tasks.filter((_, i) => picks.tasks[i]);
    const eventsSel = analysis.events.filter((_, i) => picks.events[i]);
    const replies = analysis.replies.filter((_, i) => picks.replies[i]);
    if (tasks.length + eventsSel.length + replies.length === 0) return;
    const tomorrow = addDaysYmdClient(zurichYmdClient(), 1);
    setDraftTasks(
      tasks.map((t) => ({
        ...t,
        dueDate: t.dueDate || tomorrow,
      }))
    );
    setDraftEvents(eventsSel.map((e) => ({ ...e })));
    setDraftReplies(replies.map((r) => ({ ...r })));
    setConfirmOpen(true);
  }

  async function applyConfirmed() {
    if (
      draftTasks.length + draftEvents.length + draftReplies.length ===
      0
    ) {
      return;
    }
    if (analysisEventsNeedSlot(draftEvents)) {
      setError(
        "Für Termine aus Aufgaben zuerst Dauer und freien Slot wählen."
      );
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(mailApi(analysisProvider, "apply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: draftTasks,
          events: draftEvents,
          replies: draftReplies,
          sendReplies: analysisProvider === "microsoft" ? sendReplies : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Übernehmen fehlgeschlagen");
      if (json.failCount > 0 && json.okCount === 0) {
        throw new Error(
          (json.errors || []).join(" · ") || "Übernehmen fehlgeschlagen"
        );
      }
      const dest = analysisProvider === "google" ? "Google" : "Outlook";
      const replyLabel =
        analysisProvider === "microsoft" && sendReplies
          ? `${json.replyOk} Antwort(en) gesendet`
          : `${json.replyOk} Entwurf(e) → ${dest}`;
      const parts = [
        json.taskOk
          ? `${json.taskOk} Aufgabe(n) → ${analysisProvider === "google" ? "Google Tasks" : "Outlook To Do"}`
          : null,
        json.eventOk ? `${json.eventOk} Termin(e) → ${dest}` : null,
        json.replyOk ? replyLabel : null,
      ].filter(Boolean);
      setStatus(
        [
          parts.join(" · ") || `${json.okCount} übernommen`,
          json.failCount
            ? `(${json.failCount} fehlgeschlagen: ${(json.errors || []).join("; ")})`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      );
      setPicks({ tasks: {}, events: {}, replies: {} });
      setConfirmOpen(false);
      setDraftTasks([]);
      setDraftEvents([]);
      setDraftReplies([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  const selectedCount = useMemo(() => {
    if (!analysis) return 0;
    return (
      analysis.tasks.filter((_, i) => picks.tasks[i]).length +
      analysis.events.filter((_, i) => picks.events[i]).length +
      analysis.replies.filter((_, i) => picks.replies[i]).length
    );
  }, [analysis, picks]);

  const clusterView = useMemo(() => {
    if (!analysis) {
      return {
        actionable: [] as { cluster: DayCluster; ci: number }[],
        rest: [] as { cluster: DayCluster; ci: number }[],
        visible: [] as { cluster: DayCluster; ci: number }[],
      };
    }
    const all = analysis.clusters.map((cluster, ci) => ({ cluster, ci }));
    const actionable = all.filter(({ cluster }) => clusterNeedsAction(cluster));
    const rest = all.filter(({ cluster }) => !clusterNeedsAction(cluster));
    return {
      actionable,
      rest,
      visible: showAllThreads ? all : actionable,
    };
  }, [analysis, showAllThreads]);

  function flatTaskIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++)
      n += analysis.clusters[c]?.tasks.length || 0;
    return n + localIdx;
  }
  function flatEventIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++)
      n += analysis.clusters[c]?.events.length || 0;
    return n + localIdx;
  }
  function flatReplyIndex(clusterIdx: number, localIdx: number): number {
    if (!analysis) return -1;
    let n = 0;
    for (let c = 0; c < clusterIdx; c++)
      n += analysis.clusters[c]?.replies.length || 0;
    return n + localIdx;
  }

  async function translateReplyFields(
    reply: DayReply,
    targetLang: ReplyLang
  ): Promise<DayReply> {
    if (currentReplyLang(reply) === targetLang) return reply;
    const res = await fetch(mailApi(analysisProvider, "translate-reply"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: reply.subject,
        body: reply.body,
        targetLang,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Übersetzung fehlgeschlagen (${res.status})`);
    }
    return {
      ...reply,
      subject: String(data.subject || reply.subject),
      body: String(data.body || reply.body),
      language: data.language === "en" ? "en" : "de",
    };
  }

  function patchAnalysisReply(flatIndex: number, next: DayReply) {
    setAnalysis((prev) => {
      if (!prev) return prev;
      let n = 0;
      const clusters = prev.clusters.map((c) => ({
        ...c,
        replies: c.replies.map((r) => {
          const idx = n++;
          return idx === flatIndex ? next : r;
        }),
      }));
      const replies = (prev.replies.length
        ? prev.replies
        : clusters.flatMap((c) => c.replies)
      ).map((r, i) => (i === flatIndex ? next : r));
      return { ...prev, clusters, replies };
    });
  }

  async function changeAnalysisReplyLanguage(
    flatIndex: number,
    targetLang: ReplyLang
  ) {
    if (!analysis) return;
    const reply = replyAtFlatIndex(analysis, flatIndex);
    if (!reply) return;
    if (currentReplyLang(reply) === targetLang) return;
    const cached = reply.translations?.[targetLang];
    if (cached) {
      patchAnalysisReply(flatIndex, {
        ...reply,
        subject: cached.subject,
        body: cached.body,
        language: targetLang,
      });
      return;
    }
    const key = `a-${flatIndex}`;
    setTranslatingReply(key);
    setError(null);
    try {
      const next = await translateReplyFields(reply, targetLang);
      patchAnalysisReply(
        flatIndex,
        withReplyTranslation(reply, next, currentReplyLang(reply), targetLang)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingReply(null);
    }
  }

  async function changeDraftReplyLanguage(
    draftIndex: number,
    targetLang: ReplyLang
  ) {
    const reply = draftReplies[draftIndex];
    if (!reply) return;
    if (currentReplyLang(reply) === targetLang) return;
    const cached = reply.translations?.[targetLang];
    if (cached) {
      setDraftReplies((prev) =>
        prev.map((r, i) =>
          i === draftIndex
            ? {
                ...r,
                subject: cached.subject,
                body: cached.body,
                language: targetLang,
              }
            : r
        )
      );
      return;
    }
    const key = `d-${draftIndex}`;
    setTranslatingReply(key);
    setError(null);
    try {
      const next = await translateReplyFields(reply, targetLang);
      setDraftReplies((prev) =>
        prev.map((r, i) =>
          i === draftIndex
            ? withReplyTranslation(reply, next, currentReplyLang(reply), targetLang)
            : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingReply(null);
    }
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <PageHeader
        title={
          scope === "google" ? "Google Workspace" : "Microsoft 365"
        }
        description={
          scope === "google"
            ? "Gmail, Kalender und Tasks."
            : "Outlook-Chronik, Kalender und Tagesanalysen — plus Planner und Slot-Suche."
        }
        logo={
          scope === "google" ? (
            <GoogleLogo className="size-8" />
          ) : (
            <MicrosoftLogo className="size-8" />
          )
        }
        tone={scope === "google" ? "teal" : "blue"}
      />

      {connectionReady && !anyConnected ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              {scope === "google"
                ? "Noch kein Google-Konto verbunden. Unter Konto Google Workspace verknüpfen."
                : "Noch kein Microsoft-Konto verbunden. Unter Konto Microsoft 365 verknüpfen."}
            </p>
            <Link
              href="/account"
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              Zu Konto
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {anyConnected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {msConnected ? (
                <span className="inline-flex items-center gap-1.5">
                  <MicrosoftLogo className="size-3.5" />
                  <span className="font-semibold text-foreground">
                    {msEmail || "Microsoft 365"}
                  </span>
                </span>
              ) : wantMs ? (
                <span>Outlook nicht verbunden</span>
              ) : null}
              {googleConnected ? (
                <span className="inline-flex items-center gap-1.5">
                  <GoogleLogo className="size-3.5" />
                  <span className="font-semibold text-foreground">
                    {googleEmail || "Google"}
                  </span>
                </span>
              ) : wantGoogle ? (
                <span>Google nicht verbunden</span>
              ) : null}
            </p>
            <nav
              className={segmentedTrackClass}
              aria-label="Kalender Mail Aufgaben"
            >
              <Button
                type="button"
                variant="ghost"
                data-segment="true"
                className={mailWorkspaceTabClass(tab === "mail", routeHint)}
                onClick={() => goTab("mail")}
              >
                {scope === "google" ? (
                  <GmailLogo className="size-4 shrink-0" />
                ) : (
                  <OutlookLogo className="size-4 shrink-0" />
                )}
                Mail
              </Button>
              <Button
                type="button"
                variant="ghost"
                data-segment="true"
                className={mailWorkspaceTabClass(tab === "calendar", routeHint)}
                onClick={() => goTab("calendar")}
              >
                <CalendarClock className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
                Kalender
              </Button>
              <Button
                type="button"
                variant="ghost"
                data-segment="true"
                className={mailWorkspaceTabClass(tab === "planner", routeHint)}
                onClick={() => goTab("planner")}
              >
                <span className="inline-flex items-center gap-0.5">
                  {scope === "microsoft" ? (
                    <>
                      <MicrosoftPlannerLogo className="size-4" />
                      <MicrosoftToDoLogo className="size-4" />
                    </>
                  ) : (
                    <GoogleTasksLogo className="size-4" />
                  )}
                </span>
                Aufgaben
              </Button>
            </nav>
          </div>

          {tab === "mail" ? (
            <MailWorkspaceSubnav
              view={mailView}
              onChange={goMailView}
              accent={routeHint}
              pendingTriage={triagePending}
            />
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {analyzeNotice ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                analyzing
                  ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-100"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100"
              )}
              role="status"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p>{analyzeNotice}</p>
                  {analyzing ? (
                    <p className="mt-0.5 text-[0.6875rem] opacity-80">
                      Läuft serverseitig inkl. vollständiger Mail-Threads — du
                      kannst die Seite verlassen. Bei Rückkehr erscheinen die
                      Resultate automatisch; zusätzlich Toast und
                      Push-Benachrichtigung wenn fertig.
                    </p>
                  ) : null}
                </div>
                {!analyzing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAnalyzeNotice(null)}
                  >
                    Schliessen
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {status ? (
            <p className="text-sm text-emerald-700" role="status">
              {status}
            </p>
          ) : null}

          {tab === "calendar" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[0.9375rem] font-semibold">
                  Heute · {openEvents.length} offen /{" "}
                  {visibleEvents.filter((e) => e.done).length} erledigt
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAdhocOpen(true)}
                  >
                    <CalendarPlus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                    Neuer Termin
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={calLoading}
                    onClick={() => void loadCalendar()}
                  >
                    <RefreshCw
                      className={cn("size-3.5", calLoading && "animate-spin")}
                    />
                    Aktualisieren
                  </Button>
                </div>
              </div>

              <p className="text-sm font-semibold capitalize">
                {new Intl.DateTimeFormat("de-CH", {
                  timeZone: "Europe/Zurich",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date())}
              </p>

              {reviewMode ? (
                <p className="rounded-2xl bg-orange-50 px-3 py-2 text-sm text-orange-950 ring-1 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-100 dark:ring-orange-400/30">
                  Tagesabschluss: jeden offenen Termin als erledigt markieren
                  oder auf einen freien Slot verschieben.
                </p>
              ) : null}

              {calLoading && visibleEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Lade Termine…</p>
              ) : visibleEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine Termine für heute.
                </p>
              ) : (
                <ul className="space-y-3">
                  {visibleEvents.map((e) => {
                    const key = workspaceEventKey(e);
                    const showActions =
                      !e.done || isDayCloseRitualId(e.id);
                    const isFocus = reviewMode && key === firstOpenKey;
                    return (
                    <li
                      key={key}
                      id={`cal-review-${key}`}
                    >
                      <EventArtCard
                        event={e}
                        onOpen={() => setDetailEvent(e)}
                        className={
                          isFocus
                            ? "ring-2 ring-orange-400/80"
                            : undefined
                        }
                        footer={
                          showActions ? (
                            <EventDetailActions
                              event={e}
                              busy={busyId === key}
                              slotDuration={slotDurationFor(e)}
                              slots={slotsByEvent[key] || []}
                              onPreset={(m) => {
                                setSlotDurationByEvent((prev) => ({
                                  ...prev,
                                  [key]: m,
                                }));
                                setSlotsByEvent((prev) => {
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                              }}
                              onDone={() => void markDone(e)}
                              onSuggest={() => void suggestSlots(e)}
                              onReschedule={(s) => void reschedule(e, s)}
                            />
                          ) : undefined
                        }
                      />
                    </li>
                    );
                  })}
                </ul>
              )}
              <EventDetailDialog
                event={detailEvent}
                open={Boolean(detailEvent)}
                onOpenChange={(next) => {
                  if (!next) setDetailEvent(null);
                }}
                canEdit={Boolean(
                  detailEvent &&
                    !detailEvent.done &&
                    !isDayCloseRitualId(detailEvent.id) &&
                    cloudProviderOf(detailEvent)
                )}
                saving={
                  detailEvent
                    ? busyId === workspaceEventKey(detailEvent)
                    : false
                }
                onSave={(values) =>
                  detailEvent ? saveEvent(detailEvent, values) : undefined
                }
                actions={
                  detailEvent ? (
                    <EventDetailActions
                      event={detailEvent}
                      busy={busyId === workspaceEventKey(detailEvent)}
                      slotDuration={slotDurationFor(detailEvent)}
                      slots={slotsByEvent[workspaceEventKey(detailEvent)] || []}
                      onPreset={(m) => {
                        const eKey = workspaceEventKey(detailEvent);
                        setSlotDurationByEvent((prev) => ({
                          ...prev,
                          [eKey]: m,
                        }));
                        setSlotsByEvent((prev) => {
                          const next = { ...prev };
                          delete next[eKey];
                          return next;
                        });
                      }}
                      onDone={() => void markDone(detailEvent)}
                      onSuggest={() => void suggestSlots(detailEvent)}
                      onReschedule={(s) => void reschedule(detailEvent, s)}
                    />
                  ) : null
                }
              />
              <AdhocEventDialog
                open={adhocOpen}
                onOpenChange={setAdhocOpen}
                onCreated={() => void loadCalendar()}
                providerScope={scope}
              />
            </section>
          ) : tab === "planner" ? (
            <section className="space-y-3">
              <h2 className="text-[0.9375rem] font-semibold">
                Aufgaben nach Quelle
              </h2>
              <p className="text-sm text-muted-foreground">
                {scope === "google"
                  ? "Google Tasks — anlegen, erledigen oder Termin setzen."
                  : "To Do anlegen, erledigen oder umbenennen. Planner bleibt die zugewiesenen Aufgaben."}
              </p>
              <WorkspaceTasksPanel
                microsoft={Boolean(msConnected)}
                google={Boolean(googleConnected)}
              />
            </section>
          ) : tab === "mail" && mailView === "triage" ? (
            <MailTriagePanel
              provider={scope}
              onPendingChange={setTriagePending}
            />
          ) : tab === "mail" && mailView === "chronik" ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border/60 bg-card px-3.5 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="ms-mail-from" className="text-xs text-muted-foreground">
                      Von
                    </Label>
                    <Input
                      id="ms-mail-from"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(v, mailTo);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        void loadMail(next.from, next.to);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ms-mail-to" className="text-xs text-muted-foreground">
                      Bis
                    </Label>
                    <Input
                      id="ms-mail-to"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailTo}
                      min={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(mailFrom, v);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        void loadMail(next.from, next.to);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("h-9", mailWorkspacePrimaryBtnClass(routeHint))}
                    disabled={mailLoading}
                    onClick={() => void loadMail(mailFrom, mailTo)}
                  >
                    <RefreshCw
                      className={cn("size-3.5", mailLoading && "animate-spin")}
                    />
                    Mails laden
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={mailLoading}
                  onClick={() => void loadMail(mailFrom, mailTo)}
                >
                  <RefreshCw
                    className={cn("size-3.5", mailLoading && "animate-spin")}
                  />
                  Aktualisieren
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MailChronikSummary
                  rangeLabel={formatMailRangeLabel(mailFrom, mailTo)}
                  inboxCount={countMailsInRange(inbox, "inbox")}
                  sentCount={countMailsInRange(sent, "sent")}
                />
                {msConnected ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setComposeNewOpen(true)}
                  >
                    <Send className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                    Neue Mail
                  </Button>
                ) : null}
              </div>
              <MailChronikList
                items={mergeMailChronik(inbox, sent)}
                loading={mailLoading}
                provider={scope}
                onItemsChanged={() => void loadMail()}
              />
              {msConnected ? (
                <MicrosoftMailComposeDialog
                  open={composeNewOpen}
                  onOpenChange={setComposeNewOpen}
                  mode="new"
                  onSent={() => void loadMail()}
                />
              ) : null}
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="text-[1.375rem] font-semibold tracking-tight text-foreground">
                    Tagesanalysen
                  </h2>
                  {msConnected && googleConnected ? (
                    <div className={segmentedTrackClass} aria-label="Analyse-Postfach">
                      <Button
                        type="button"
                        variant="ghost"
                        data-segment="true"
                        className={mailWorkspaceTabClass(
                          analysisProvider === "microsoft",
                          "microsoft"
                        )}
                        onClick={() => setAnalysisProvider("microsoft")}
                      >
                        <OutlookLogo className="size-4 shrink-0" />
                        Outlook
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        data-segment="true"
                        className={mailWorkspaceTabClass(
                          analysisProvider === "google",
                          "google"
                        )}
                        onClick={() => setAnalysisProvider("google")}
                      >
                        <GmailLogo className="size-4 shrink-0" />
                        Gmail
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label
                      htmlFor="ms-mail-from-ta"
                      className="text-xs text-muted-foreground"
                    >
                      Von
                    </Label>
                    <Input
                      id="ms-mail-from-ta"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(v, mailTo);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        setAnalysis(null);
                        setAnalyzeNotice(null);
                        setAnalysisFromCache(false);
                        setPicks({ tasks: {}, events: {}, replies: {} });
                        void loadMail(next.from, next.to);
                        void loadAnalysisForRange(next.from, next.to);
                      }}
                    />
                    <Label
                      htmlFor="ms-mail-to-ta"
                      className="text-xs text-muted-foreground"
                    >
                      Bis
                    </Label>
                    <Input
                      id="ms-mail-to-ta"
                      type="date"
                      className="h-9 w-auto min-w-[9.5rem]"
                      value={mailTo}
                      min={mailFrom}
                      max={zurichYmdClient()}
                      onValueChange={(v) => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                        const next = clampMailRange(mailFrom, v);
                        if (next.from === mailFrom && next.to === mailTo) return;
                        setMailFrom(next.from);
                        setMailTo(next.to);
                        setAnalysis(null);
                        setAnalyzeNotice(null);
                        setAnalysisFromCache(false);
                        setPicks({ tasks: {}, events: {}, replies: {} });
                        void loadMail(next.from, next.to);
                        void loadAnalysisForRange(next.from, next.to);
                      }}
                    />
                    {cachedDays.includes(mailRangeKey(mailFrom, mailTo)) ? (
                      <span className="text-[0.6875rem] text-muted-foreground">
                        Analyse gespeichert
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={mailLoading}
                    onClick={() => void loadMail(mailFrom, mailTo)}
                  >
                    <RefreshCw
                      className={cn("size-3.5", mailLoading && "animate-spin")}
                    />
                    Aktualisieren
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("h-9", mailWorkspacePrimaryBtnClass(analysisProvider))}
                    disabled={analyzing}
                    onClick={() => startAnalyze()}
                  >
                    <Sparkles
                      className={cn("size-3.5", analyzing && "animate-pulse")}
                    />
                    {analyzing
                      ? "Analyse läuft…"
                      : analysis &&
                          cachedDays.includes(mailRangeKey(mailFrom, mailTo))
                        ? "Neu analysieren"
                        : "Neue AI Tagesanalyse"}
                  </Button>
                </div>
              </div>
              <MailAnalysisThreadHint
                coverage={mailThreadCoverage}
                clusterCount={analysis?.clusters.length ?? null}
              />
              <MailTagesanalysenList
                entries={cachedEntries}
                selectedKey={`${analysisProvider}:${mailRangeKey(mailFrom, mailTo)}`}
                accent={analysisProvider}
                onSelect={(entry) => {
                  if (
                    entry.provider === "microsoft" ||
                    entry.provider === "google"
                  ) {
                    setAnalysisProvider(entry.provider);
                  }
                  setMailFrom(entry.fromYmd);
                  setMailTo(entry.toYmd);
                  setPicks({ tasks: {}, events: {}, replies: {} });
                  void loadMail(entry.fromYmd, entry.toYmd);
                  void loadAnalysisForRange(entry.fromYmd, entry.toYmd);
                }}
              />

              {analysis ? (
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                      AI · Tagesbild
                      {analysisFromCache ? (
                        <Badge variant="secondary" className="text-[0.625rem] font-normal">
                          gespeichert
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <MailAnalysisThreadHint
                      coverage={mailThreadCoverage}
                      clusterCount={analysis.clusters.length}
                      compact
                      className="mt-1"
                    />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed">{analysis.daySummary}</p>
                    {formatTokenUsageLine(analysis.usage) ? (
                      <p className="text-[0.6875rem] text-muted-foreground">
                        Tokens · {formatTokenUsageLine(analysis.usage)}
                      </p>
                    ) : null}

                    {analysis.clusters.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Keine Cluster / Handlungsvorschläge.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {clusterView.visible.length === 0 &&
                        !showAllThreads &&
                        clusterView.rest.length > 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Keine offenen Handlungen — nur Info-/FYI-Threads.
                          </p>
                        ) : null}
                        <ul className="space-y-3">
                        {clusterView.visible.map(({ cluster, ci }) => (
                          <li
                            key={`${cluster.company}-${cluster.theme}-${ci}`}
                            className="rounded-lg border border-border/60 bg-muted/20 p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-snug">
                                  {cluster.company}
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    · {cluster.theme}
                                  </span>
                                </p>
                                {cluster.counterpartEmail ? (
                                  <p className="text-[0.6875rem] text-muted-foreground">
                                    {cluster.counterpartEmail}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {!clusterNeedsAction(cluster) ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[0.625rem] font-normal"
                                  >
                                    Thread erfordert keine Aktion
                                  </Badge>
                                ) : null}
                                {cluster.status ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[0.625rem]"
                                  >
                                    {STATUS_LABEL[cluster.status] ||
                                      cluster.status}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            <p className="mt-1.5 text-sm leading-snug text-foreground/90">
                              {cluster.summary}
                            </p>

                            {cluster.tasks.length > 0 ? (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Aufgaben
                                </p>
                                {cluster.tasks.map((t, li) => {
                                  const i = flatTaskIndex(ci, li);
                                  const existing = t.existingTask;
                                  const matched = Boolean(existing?.id);
                                  return (
                                    <label
                                      key={`t-${ci}-${li}`}
                                      className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        disabled={matched}
                                        checked={
                                          matched
                                            ? false
                                            : Boolean(picks.tasks[i])
                                        }
                                        onChange={(e) =>
                                          setPicks((prev) => ({
                                            ...prev,
                                            tasks: {
                                              ...prev.tasks,
                                              [i]: e.target.checked,
                                            },
                                          }))
                                        }
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-sm font-medium">
                                          {t.title}
                                        </span>
                                        {existing ? (
                                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
                                            <Badge
                                              variant={
                                                existing.status === "done"
                                                  ? "secondary"
                                                  : "outline"
                                              }
                                              className="text-[0.625rem]"
                                            >
                                              {existing.status === "done"
                                                ? existing.source === "planner"
                                                  ? "Erledigt in Planner"
                                                  : existing.source === "google"
                                                    ? "Erledigt in Google Tasks"
                                                    : "Erledigt in To Do"
                                                : existing.source === "planner"
                                                  ? "Offen in Planner"
                                                  : existing.source === "google"
                                                    ? "Offen in Google Tasks"
                                                    : "Offen in To Do"}
                                            </Badge>
                                            <span className="text-muted-foreground">
                                              {existing.title}
                                            </span>
                                            {existing.href ? (
                                              <a
                                                href={existing.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-primary underline-offset-2 hover:underline"
                                                onClick={(e) =>
                                                  e.stopPropagation()
                                                }
                                              >
                                                öffnen
                                              </a>
                                            ) : null}
                                          </span>
                                        ) : (
                                          <span className="block text-[0.6875rem] text-muted-foreground">
                                            {[
                                              t.dueDate
                                                ? `fällig ${toSwissDate(t.dueDate)}`
                                                : null,
                                              t.reason,
                                            ]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </span>
                                        )}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}

                            {cluster.events.length > 0 ? (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Termine
                                </p>
                                {cluster.events.map((ev, li) => {
                                  const i = flatEventIndex(ci, li);
                                  return (
                                    <label
                                      key={`e-${ci}-${li}`}
                                      className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={Boolean(picks.events[i])}
                                        onChange={(e) =>
                                          setPicks((prev) => ({
                                            ...prev,
                                            events: {
                                              ...prev.events,
                                              [i]: e.target.checked,
                                            },
                                          }))
                                        }
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-sm font-medium">
                                          {ev.title}
                                        </span>
                                        <span className="block text-[0.6875rem] text-muted-foreground">
                                          {[
                                            ev.fromTaskTwin
                                              ? "aus Aufgabe"
                                              : null,
                                            toSwissDate(ev.date),
                                            ev.fromTaskTwin && !ev.startTime
                                              ? "Zeit wählen beim Übernehmen"
                                              : ev.allDay || !ev.startTime
                                                ? "ganztags"
                                                : `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}`,
                                            ev.location,
                                            ev.reason,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}

                            {cluster.replies.length > 0 ? (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Antwort-Entwürfe
                                </p>
                                {cluster.replies.map((r, li) => {
                                  const i = flatReplyIndex(ci, li);
                                  const lang = currentReplyLang(r);
                                  const busy = translatingReply === `a-${i}`;
                                  return (
                                    <div
                                      key={`r-${ci}-${li}`}
                                      className="flex items-start gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
                                    >
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        aria-label={`Antwort ${r.subject}`}
                                        checked={Boolean(picks.replies[i])}
                                        onChange={(e) =>
                                          setPicks((prev) => ({
                                            ...prev,
                                            replies: {
                                              ...prev.replies,
                                              [i]: e.target.checked,
                                            },
                                          }))
                                        }
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-start justify-between gap-2">
                                          <span className="block text-sm font-medium">
                                            {r.subject}
                                          </span>
                                          <ReplyLangToggle
                                            lang={lang}
                                            busy={busy}
                                            onChange={(next) =>
                                              void changeAnalysisReplyLanguage(
                                                i,
                                                next
                                              )
                                            }
                                          />
                                        </span>
                                        <span className="block text-[0.6875rem] text-muted-foreground">
                                          An {r.to}
                                          {r.reason ? ` · ${r.reason}` : ""}
                                          {busy ? " · übersetzt…" : ""}
                                        </span>
                                        <span className="mt-1 block whitespace-pre-wrap text-xs text-foreground/80">
                                          {r.body}
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </li>
                        ))}
                        </ul>
                        {clusterView.rest.length > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAllThreads((v) => !v)}
                          >
                            {showAllThreads
                              ? `Nur offene Threads (${clusterView.actionable.length})`
                              : `Alle Threads zeigen (${clusterView.rest.length} weitere)`}
                          </Button>
                        ) : null}
                      </div>
                    )}

                    {selectedCount > 0 ||
                    analysis.tasks.length +
                      analysis.events.length +
                      analysis.replies.length >
                      0 ? (
                      <div className="space-y-2 border-t border-border/50 pt-3">
                        <Button
                          type="button"
                          size="sm"
                          disabled={applying || selectedCount === 0}
                          onClick={() => openConfirm()}
                        >
                          {`Ausgewählte prüfen (${selectedCount})`}
                        </Button>
                        <p className="text-[0.6875rem] text-muted-foreground">
                          {analysisProvider === "google"
                            ? "Übernahme nach Google: Aufgaben → Tasks, Termine → Kalender, Antworten → Gmail-Entwürfe."
                            : "Übernahme nach Outlook: Aufgaben → To Do, Termine → Kalender, Antworten → Entwürfe."}{" "}
                          Vor dem Anlegen kannst du Texte noch anpassen.
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

            </section>
          )}
        </>
      ) : !connectionReady ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle>Übernehmen bestätigen</DialogTitle>
            <DialogDescription>
              Texte und Daten bei Bedarf anpassen, dann bei{" "}
              {analysisProvider === "google" ? "Google" : "Outlook"} anlegen.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            {draftTasks.map((t, i) => (
              <div key={`dt-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Aufgabe ·{" "}
                  {analysisProvider === "google"
                    ? "Google Tasks"
                    : "Outlook To Do"}
                </p>
                <div className="space-y-1">
                  <Label>Titel</Label>
                  <Input
                    value={t.title}
                    onChange={(e) =>
                      setDraftTasks((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fällig</Label>
                  <Input
                    type="date"
                    value={t.dueDate || ""}
                    onChange={(e) =>
                      setDraftTasks((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? { ...x, dueDate: e.target.value || null }
                            : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Notizen</Label>
                  <Textarea
                    rows={3}
                    value={t.notes || ""}
                    onChange={(e) =>
                      setDraftTasks((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, notes: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
              </div>
            ))}
            {draftEvents.map((ev, i) => (
              <AnalysisEventDraftCard
                key={`de-${i}`}
                event={ev}
                calendarLabel={
                  analysisProvider === "google"
                    ? "Google Kalender"
                    : "Outlook Kalender"
                }
                slotProvider={analysisProvider}
                disabled={applying}
                onChange={(next) =>
                  setDraftEvents((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, ...next } : x))
                  )
                }
              />
            ))}
            {draftReplies.map((r, i) => {
              const lang = currentReplyLang(r);
              const busy = translatingReply === `d-${i}`;
              return (
              <div key={`dr-${i}`} className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    Antwort ·{" "}
                    {analysisProvider === "microsoft" && sendReplies
                      ? "direkt senden"
                      : analysisProvider === "google"
                        ? "Gmail Entwurf"
                        : "Outlook Entwurf"}
                    {busy ? " · übersetzt…" : ""}
                  </p>
                  <ReplyLangToggle
                    lang={lang}
                    busy={busy || applying}
                    onChange={(next) => void changeDraftReplyLanguage(i, next)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>An</Label>
                  <Input
                    value={r.to}
                    onChange={(e) =>
                      setDraftReplies((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, to: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Betreff</Label>
                  <Input
                    value={r.subject}
                    onChange={(e) =>
                      setDraftReplies((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, subject: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Text</Label>
                  <Textarea
                    rows={5}
                    value={r.body}
                    onChange={(e) =>
                      setDraftReplies((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, body: e.target.value } : x
                        )
                      )
                    }
                  />
                </div>
              </div>
              );
            })}
          </div>
          <DialogFooter className="flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-col sm:space-x-0">
            {draftReplies.length > 0 && analysisProvider === "microsoft" ? (
              <label className="flex w-full items-start gap-2 text-left text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={sendReplies}
                  onChange={(e) => setSendReplies(e.target.checked)}
                  disabled={applying}
                />
                <span>
                  Antworten <span className="font-medium text-foreground">direkt senden</span>
                  {" "}(sonst nur Entwurf). Signatur aus Konto wird angehängt, falls hinterlegt.
                </span>
              </label>
            ) : null}
            <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={applying}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={
                applying ||
                draftTasks.length + draftEvents.length + draftReplies.length ===
                  0 ||
                analysisEventsNeedSlot(draftEvents)
              }
              onClick={() => void applyConfirmed()}
            >
              {applying
                ? "…"
                : sendReplies &&
                    draftReplies.length > 0 &&
                    analysisProvider === "microsoft"
                  ? "Anlegen & senden"
                  : analysisProvider === "google"
                    ? "In Google anlegen"
                    : "In Outlook anlegen"}
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        OAuth und Status unter{" "}
        <Link href="/account" className="underline underline-offset-2">
          Konto
        </Link>
        .
      </p>
    </div>
  );
}
