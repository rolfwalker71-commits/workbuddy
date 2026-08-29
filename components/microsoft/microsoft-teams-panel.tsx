"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  EyeOff,
  FileText,
  Hash,
  Inbox,
  MessageSquare,
  RefreshCw,
  Rows3,
  Search,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MicrosoftTeamsLogo } from "@/components/branding/provider-logos";
import {
  TeamsAnalysisResults,
  TeamsAnalysisTrigger,
  TeamsApplyConfirmDialog,
  useTeamsAnalysis,
} from "@/components/microsoft/microsoft-teams-analysis";
import { MeetingTranscriptPanel } from "@/components/microsoft/meeting-transcript-panel";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import {
  MARI_FLYOUT_MS,
  MariMainFlyoutShell,
  useFlyoutPresence,
} from "@/components/maringo/maringo-flyout-chrome";
import { useT } from "@/components/i18n/locale-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  buildTeamsInboxCards,
  inboxCardCanApply,
  inboxCardHasMeeting,
  isTeamsInboxActiveToday,
  mergeTeamsInboxThreads,
  type TeamsInboxCard,
  type TeamsInboxFilter,
  type TeamsInboxStatus,
  type TeamsInboxThreadRow,
} from "@/lib/microsoft/teams-inbox";
import { zurichHm, zurichYmd } from "@/lib/microsoft/time";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { formatSwissDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

type ChatItem = {
  id: string;
  title: string;
  chatType: "oneOnOne" | "group" | "meeting" | "unknown";
  lastUpdatedAt: string | null;
  preview: string | null;
  webUrl: string | null;
  joinUrl: string | null;
  calendarEventId?: string | null;
  memberNames: string[];
};

type ChannelItem = {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  description: string | null;
  webUrl: string | null;
  membershipType: "standard" | "private" | "shared" | "unknown";
};

type TeamItem = {
  id: string;
  name: string;
  description: string | null;
  channels: ChannelItem[];
};

type ChatMessage = {
  id: string;
  createdAt: string | null;
  from: string | null;
  text: string;
};

type OpenTarget =
  | {
      kind: "chat";
      id: string;
      chatType: ChatItem["chatType"];
      joinUrl: string | null;
    }
  | { kind: "channel"; teamId: string; channelId: string };

const FILTERS: Array<{
  id: TeamsInboxFilter;
  labelKey: "common.today" | "workspace.statusOpen" | "workspace.statusDone";
  icon: typeof Calendar;
}> = [
  { id: "today", labelKey: "common.today", icon: Calendar },
  { id: "open", labelKey: "workspace.statusOpen", icon: Inbox },
  { id: "done", labelKey: "workspace.statusDone", icon: CheckCircle2 },
];

function inboxTimeLabel(iso: string | null, todayYmd: string): string {
  if (!iso) return "";
  if (isTeamsInboxActiveToday(iso, todayYmd)) {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? zurichHm(d) : formatSwissDateTime(iso);
  }
  return formatSwissDateTime(iso);
}

const TEAMS_INBOX_COMPACT_KEY = "workbuddy.teams-inbox.compact";

function readTeamsInboxCompact(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TEAMS_INBOX_COMPACT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTeamsInboxCompact(next: boolean) {
  try {
    window.localStorage.setItem(TEAMS_INBOX_COMPACT_KEY, next ? "1" : "0");
  } catch {
    /* ignore quota */
  }
}

function cardIcon(card: TeamsInboxCard) {
  if (card.kind === "channel") return Hash;
  if (card.chatType === "meeting") return Video;
  if (card.chatType === "group") return Users;
  return MessageSquare;
}

export function MicrosoftTeamsPanel({
  initialChatId = null,
}: {
  initialChatId?: string | null;
}) {
  const t = useT();
  const todayYmd = zurichYmd();
  const [filter, setFilter] = useState<TeamsInboxFilter>("today");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [compact, setCompact] = useState(false);
  const [transcriptKey, setTranscriptKey] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [threads, setThreads] = useState<TeamsInboxThreadRow[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsChatReconnect, setNeedsChatReconnect] = useState(false);
  const [needsChannelReconnect, setNeedsChannelReconnect] = useState(false);
  const [patchingKey, setPatchingKey] = useState<string | null>(null);
  const [applyCard, setApplyCard] = useState<TeamsInboxCard | null>(null);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadWebUrl, setThreadWebUrl] = useState<string | null>(null);
  const [threadChatId, setThreadChatId] = useState<string | null>(null);
  const [threadChatType, setThreadChatType] =
    useState<ChatItem["chatType"] | null>(null);
  const [threadJoinUrl, setThreadJoinUrl] = useState<string | null>(null);
  const [threadEventId, setThreadEventId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const threadAnalysis = useTeamsAnalysis();
  const dayAnalysis = useTeamsAnalysis({ hydrateDay: true });
  const openedFromUrl = useRef(false);
  const ranDayRef = useRef(false);
  const [flyoutPortalReady, setFlyoutPortalReady] = useState(false);
  const flyoutWanted = open != null;
  const flyoutPresence = useFlyoutPresence(flyoutWanted);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    setError(null);
    setNeedsChatReconnect(false);
    try {
      const res = await fetch("/api/microsoft/teams/chats");
      const json = await res.json().catch(() => ({}));
      if (res.status === 403 && json.needsReconnect) {
        setNeedsChatReconnect(true);
        setChats([]);
        return;
      }
      if (!res.ok) throw new Error(json.error || t("microsoft.loadChatsFailed"));
      setChats((json.chats || []) as ChatItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChats(false);
    }
  }, [t]);

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    setNeedsChannelReconnect(false);
    try {
      const res = await fetch("/api/microsoft/teams/channels");
      const json = await res.json().catch(() => ({}));
      if (res.status === 403 && json.needsReconnect) {
        setNeedsChannelReconnect(true);
        setTeams([]);
        return;
      }
      if (!res.ok) throw new Error(json.error || t("microsoft.loadChannelsFailed"));
      setTeams((json.teams || []) as TeamItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChannels(false);
    }
  }, [t]);

  const queryRef = useRef("");
  const searchSkipRef = useRef(true);
  const threadsReqRef = useRef(0);

  const loadThreads = useCallback(async (q?: string, silent?: boolean) => {
    const needle = (q ?? "").trim();
    const req = ++threadsReqRef.current;
    if (!silent) setLoadingThreads(true);
    try {
      const qs = needle ? `?q=${encodeURIComponent(needle)}` : "";
      const res = await fetch(`/api/microsoft/teams/threads${qs}`);
      const json = await res.json().catch(() => ({}));
      if (req !== threadsReqRef.current) return;
      if (!res.ok) throw new Error(json.error || t("microsoft.loadInboxFailed"));
      const incoming = (json.threads || []) as TeamsInboxThreadRow[];
      setThreads((prev) =>
        needle ? mergeTeamsInboxThreads(prev, incoming) : incoming
      );
    } catch (err) {
      if (req !== threadsReqRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (req === threadsReqRef.current && !silent) setLoadingThreads(false);
    }
  }, [t]);

  const refresh = useCallback(() => {
    void loadChats();
    void loadChannels();
    void loadThreads(queryRef.current || undefined);
  }, [loadChats, loadChannels, loadThreads]);

  useEffect(() => {
    setCompact(readTeamsInboxCompact());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = query.trim();
      setDebouncedQuery(next);
      queryRef.current = next;
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (searchSkipRef.current) {
      searchSkipRef.current = false;
      return;
    }
    void loadThreads(debouncedQuery || undefined, true);
  }, [debouncedQuery, loadThreads]);

  useEffect(() => {
    if (dayAnalysis.loading) return;
    void loadThreads(queryRef.current || undefined, true);
  }, [dayAnalysis.analysis, dayAnalysis.threadKeys, dayAnalysis.loading, loadThreads]);

  useEffect(() => {
    if (!ranDayRef.current || dayAnalysis.loading) return;
    ranDayRef.current = false;
    if (dayAnalysis.error) {
      showActionFeedback({
        headline: t("microsoft.dayAnalysisFailed"),
        detail: dayAnalysis.error,
        tone: "error",
      });
      return;
    }
    if (dayAnalysis.analysis) {
      showActionFeedback({
        headline: t("microsoft.dayAnalysisDone"),
        detail: dayAnalysis.meta || t("microsoft.cardsStamped"),
      });
    }
  }, [dayAnalysis.analysis, dayAnalysis.error, dayAnalysis.loading, dayAnalysis.meta, t]);

  useEffect(() => {
    const onInbox = () => {
      void loadThreads(queryRef.current || undefined, true);
    };
    window.addEventListener("buddy:inbox", onInbox);
    return () => window.removeEventListener("buddy:inbox", onInbox);
  }, [loadThreads]);

  function resetThread() {
    setMessages([]);
    threadAnalysis.reset();
  }

  const closeFlyout = useCallback(() => {
    setOpen(null);
  }, []);

  useEffect(() => {
    setFlyoutPortalReady(true);
  }, []);

  useEffect(() => {
    if (!flyoutWanted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [flyoutWanted]);

  useEffect(() => {
    if (!flyoutWanted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeFlyout();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [flyoutWanted, closeFlyout]);

  async function openChat(chat: ChatItem) {
    setOpen({
      kind: "chat",
      id: chat.id,
      chatType: chat.chatType,
      joinUrl: chat.joinUrl,
    });
    setThreadTitle(chat.title);
    setThreadWebUrl(chat.webUrl);
    setThreadChatId(chat.id);
    setThreadChatType(chat.chatType);
    setThreadJoinUrl(chat.joinUrl);
    setThreadEventId(chat.calendarEventId ?? null);
    resetThread();
    setMsgLoading(true);
    try {
      const res = await fetch(
        `/api/microsoft/teams/messages?chatId=${encodeURIComponent(chat.id)}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("microsoft.messagesFailed"));
      setMessages((json.messages || []) as ChatMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMsgLoading(false);
    }
  }

  async function openChannel(channel: {
    teamId: string;
    channelId: string;
    title: string;
    webUrl: string | null;
  }) {
    setOpen({
      kind: "channel",
      teamId: channel.teamId,
      channelId: channel.channelId,
    });
    setThreadTitle(channel.title);
    setThreadWebUrl(channel.webUrl);
    setThreadChatId(null);
    setThreadChatType(null);
    setThreadJoinUrl(null);
    setThreadEventId(null);
    resetThread();
    setMsgLoading(true);
    try {
      const qs = new URLSearchParams({
        teamId: channel.teamId,
        channelId: channel.channelId,
      });
      const res = await fetch(`/api/microsoft/teams/messages?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (res.status === 403 && json.needsReconnect) {
        setNeedsChannelReconnect(true);
        return;
      }
      if (!res.ok) throw new Error(json.error || t("microsoft.messagesFailed"));
      setMessages((json.messages || []) as ChatMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMsgLoading(false);
    }
  }

  function openCard(card: TeamsInboxCard) {
    if (card.kind === "chat") {
      const chat = chats.find((c) => c.id === card.threadKey);
      if (chat) {
        void openChat(chat);
        return;
      }
      void openChat({
        id: card.threadKey,
        title: card.title,
        chatType: card.chatType || "unknown",
        lastUpdatedAt: card.lastActiveAt,
        preview: card.preview,
        webUrl: card.webUrl,
        joinUrl: card.joinUrl,
        calendarEventId: card.calendarEventId,
        memberNames: [],
      });
      return;
    }
    if (!card.teamId || !card.channelId) return;
    void openChannel({
      teamId: card.teamId,
      channelId: card.channelId,
      title: card.title,
      webUrl: card.webUrl,
    });
  }

  useEffect(() => {
    if (openedFromUrl.current || !initialChatId || chats.length === 0) return;
    const chat = chats.find((c) => c.id === initialChatId);
    if (!chat) return;
    openedFromUrl.current = true;
    void openChat(chat);
  }, [initialChatId, chats]);

  function analyzeOpenThread() {
    if (!open) return;
    void threadAnalysis.run(
      open.kind === "chat"
        ? { chatId: open.id }
        : { teamId: open.teamId, channelId: open.channelId }
    );
  }

  const channels = useMemo(
    () => teams.flatMap((t) => t.channels),
    [teams]
  );

  const cards = useMemo(
    () =>
      buildTeamsInboxCards({
        chats,
        channels,
        threads,
        dayAnalysis: dayAnalysis.analysis,
        dayThreadKeys: dayAnalysis.threadKeys,
        todayYmd,
        filter,
        q: debouncedQuery,
      }),
    [
      chats,
      channels,
      threads,
      dayAnalysis.analysis,
      dayAnalysis.threadKeys,
      todayYmd,
      filter,
      debouncedQuery,
    ]
  );

  const loading = loadingChats || loadingChannels || loadingThreads;

  async function patchInbox(card: TeamsInboxCard, inbox: TeamsInboxStatus) {
    setPatchingKey(card.threadKey);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/teams/threads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadKey: card.threadKey,
          kind: card.kind,
          inbox,
          title: card.title,
          preview: card.preview,
          lastActiveAt: card.lastActiveAt,
          joinUrl: card.joinUrl,
          calendarEventId: card.calendarEventId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("microsoft.saveStatusFailed"));
      const next = json.thread as TeamsInboxThreadRow | undefined;
      setThreads((prev) => {
        if (!next) {
          return prev.map((t) =>
            t.threadKey === card.threadKey ? { ...t, inbox } : t
          );
        }
        const rest = prev.filter((t) => t.threadKey !== next.threadKey);
        return [next, ...rest];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchingKey(null);
    }
  }

  function startApply(card: TeamsInboxCard) {
    if (!inboxCardCanApply(card)) {
      openCard(card);
      return;
    }
    setApplyCard(card);
  }

  const applyEvents = useMemo(
    () =>
      (applyCard?.lastAnalysis?.events || []).map((ev) => ({
        title: ev.title,
        date: ev.date,
        startTime: ev.startTime,
        endTime: ev.endTime,
        allDay: ev.allDay ?? !ev.startTime,
        location: ev.location,
        notes: ev.notes,
        reason: ev.reason,
        sourceChatId: ev.sourceChatId,
        sourceChatTitle: ev.sourceChatTitle,
      })),
    [applyCard]
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
            <MicrosoftTeamsLogo className="size-4" />
            Teams
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("microsoft.inboxHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeamsAnalysisTrigger
            loading={dayAnalysis.loading}
            disabled={loadingChats}
            label={
              dayAnalysis.analysis
                ? t("workspace.reanalyze")
                : t("microsoft.analyzeDay")
            }
            onAnalyze={() => {
              ranDayRef.current = true;
              void dayAnalysis.run({ scope: "day" });
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              strokeWidth={APP_ICON_STROKE}
            />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className={segmentedTrackClass}
          role="tablist"
          aria-label={t("microsoft.inboxAria")}
        >
          {FILTERS.map((item) => {
            const Icon = item.icon;
            const selected = filter === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                role="tab"
                data-segment="true"
                aria-selected={selected}
                className={segmentedTriggerClass(selected)}
                onClick={() => setFilter(item.id)}
              >
                <Icon className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
                {t(item.labelKey)}
              </Button>
            );
          })}
        </div>
        <Button
          type="button"
          variant={compact ? "secondary" : "outline"}
          aria-pressed={compact}
          data-segment="true"
          className="h-10 min-h-10 rounded-full px-3"
          onClick={() => {
            setCompact((prev) => {
              const next = !prev;
              writeTeamsInboxCompact(next);
              return next;
            });
          }}
        >
          <Rows3 className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
          {t("common.compact")}
        </Button>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={APP_ICON_STROKE}
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onValueChange={setQuery}
          placeholder={t("common.searchEllipsis")}
          aria-label={t("microsoft.searchInbox")}
          className="h-11 pl-9"
        />
      </div>

      {needsChannelReconnect || needsChatReconnect ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30">
          {needsChannelReconnect
            ? t("microsoft.entraRightsBefore")
            : t("microsoft.teamsRightsBefore")}
          <a href="/account" className="font-medium underline underline-offset-2">
            {t("common.account")}
          </a>{" "}
          Microsoft 365 <strong>{t("common.reconnect")}</strong>
          {needsChannelReconnect
            ? t("microsoft.entraRightsAfter")
            : t("microsoft.teamsRightsAfter")}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {dayAnalysis.loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("microsoft.dayAnalysisRunning")}
        </p>
      ) : dayAnalysis.error ? (
        <p className="text-sm text-destructive" role="alert">
          {dayAnalysis.error}
        </p>
      ) : null}

      {loading && cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("microsoft.loadingInbox")}</p>
      ) : cards.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/50">
          {debouncedQuery
            ? t("microsoft.noHits", { query: debouncedQuery })
            : filter === "today"
              ? t("microsoft.nothingOpenToday")
              : filter === "done"
                ? t("microsoft.noDoneThreads")
                : t("microsoft.nothingOpenOrLater")}
        </p>
      ) : (
        <ul className={cn(compact ? "space-y-1.5" : "space-y-2.5")}>
          {cards.map((card) => {
            const active =
              (open?.kind === "chat" && open.id === card.threadKey) ||
              (open?.kind === "channel" &&
                card.teamId === open.teamId &&
                card.channelId === open.channelId);
            const Icon = cardIcon(card);
            const busy = patchingKey === card.threadKey;
            const time = inboxTimeLabel(card.lastActiveAt, todayYmd);
            const showMeeting = inboxCardHasMeeting(card);
            const transcriptOpen = transcriptKey === card.threadKey;
            const actionBtn = cn(
              "gap-1 px-2.5",
              compact ? "h-7" : "h-8"
            );
            return (
              <li key={card.threadKey}>
                <article
                  className={cn(
                    "rounded-2xl bg-card shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1",
                    compact ? "px-2.5 py-1.5" : "px-3.5 py-3",
                    active ? "ring-primary" : "ring-border/50 hover:bg-muted"
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => openCard(card)}
                    className="flex w-full items-start gap-3 rounded-xl text-left"
                  >
                    <span
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-xl bg-muted",
                        compact ? "mt-0 size-7" : "mt-0.5 size-9"
                      )}
                    >
                      <Icon className="size-4" strokeWidth={APP_ICON_STROKE} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        {compact ? (
                          <span className="flex min-w-0 flex-1 items-baseline gap-2">
                            <span className="truncate text-sm font-semibold leading-snug">
                              {card.title}
                            </span>
                            {card.preview || time ? (
                              <span className="min-w-0 truncate text-xs text-muted-foreground">
                                {[card.preview, time].filter(Boolean).join(" · ")}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="min-w-0 text-sm font-semibold leading-snug break-words">
                            {card.title}
                          </span>
                        )}
                        <span className="flex max-w-[55%] flex-wrap justify-end gap-1">
                          {card.inbox !== "open" || filter !== "open" ? (
                            <InboxBadge tone={card.inbox}>
                              {card.inbox === "later"
                                ? t("common.later")
                                : card.inbox === "done"
                                  ? t("workspace.statusDone")
                                  : card.inbox === "ignored"
                                    ? t("microsoft.ignored")
                                    : t("workspace.statusOpen")}
                            </InboxBadge>
                          ) : null}
                          <InboxBadge>
                            {card.kind === "channel"
                              ? t("microsoft.channel")
                              : card.chatType === "meeting"
                                ? t("microsoft.meeting")
                                : card.chatType === "group"
                                  ? t("microsoft.group")
                                  : t("microsoft.chat")}
                          </InboxBadge>
                          {card.analyzed ? (
                            <InboxBadge tone="ok">{t("microsoft.analyzed")}</InboxBadge>
                          ) : null}
                          {card.taskCount > 0 ? (
                            <InboxBadge tone="task">
                              {card.taskCount === 1
                                ? t("microsoft.oneTask")
                                : t("microsoft.nTasks", { count: card.taskCount })}
                            </InboxBadge>
                          ) : null}
                          {card.eventCount > 0 ? (
                            <InboxBadge tone="event">
                              {card.eventCount === 1
                                ? t("microsoft.oneEvent")
                                : t("microsoft.nEvents", { count: card.eventCount })}
                            </InboxBadge>
                          ) : null}
                        </span>
                      </span>
                      {compact ? (
                        card.issueId ? (
                          <span className="mt-0.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-950 dark:bg-amber-500/20 dark:text-amber-100">
                            {t("microsoft.ticketHash", { id: card.issueId })}
                          </span>
                        ) : null
                      ) : (
                        <>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {card.kind === "channel"
                              ? t("microsoft.channel")
                              : card.chatType === "meeting"
                                ? t("microsoft.meeting")
                                : card.chatType === "group"
                                  ? t("microsoft.group")
                                  : t("microsoft.chat")}
                            {time ? ` · ${time}` : ""}
                          </span>
                          {card.preview ? (
                            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                              {card.preview}
                            </span>
                          ) : null}
                          {card.issueId ? (
                            <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-950 dark:bg-amber-500/20 dark:text-amber-100">
                              {t("microsoft.ticketHash", { id: card.issueId })}
                            </span>
                          ) : null}
                        </>
                      )}
                    </span>
                  </button>
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-1.5",
                      compact ? "mt-1.5 pl-9" : "mt-2 pl-12"
                    )}
                  >
                    {card.inbox === "later" || card.inbox === "done" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className={actionBtn}
                        onClick={() => void patchInbox(card, "open")}
                      >
                        <Inbox className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        {t("workspace.statusOpen")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className={actionBtn}
                        onClick={() => void patchInbox(card, "later")}
                      >
                        <Clock3 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        {t("common.later")}
                      </Button>
                    )}
                    {card.inbox !== "done" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className={actionBtn}
                        onClick={() => void patchInbox(card, "done")}
                      >
                        <Check className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        {t("workspace.statusDone")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      className={actionBtn}
                      onClick={() => void patchInbox(card, "ignored")}
                    >
                      <EyeOff className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                      {t("microsoft.ignore")}
                    </Button>
                    {showMeeting ? (
                      <Button
                        type="button"
                        variant={transcriptOpen ? "secondary" : "outline"}
                        size="sm"
                        className={actionBtn}
                        aria-expanded={transcriptOpen}
                        aria-controls={`teams-transcript-${card.threadKey}`}
                        onClick={() =>
                          setTranscriptKey((prev) =>
                            prev === card.threadKey ? null : card.threadKey
                          )
                        }
                      >
                        <FileText className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        {t("microsoft.transcript")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || dayAnalysis.applying}
                      className={cn(actionBtn, "ml-auto")}
                      onClick={() => startApply(card)}
                    >
                      <UserPlus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                      {t("microsoft.apply")}
                    </Button>
                  </div>
                  {showMeeting && transcriptOpen ? (
                    <div
                      id={`teams-transcript-${card.threadKey}`}
                      className={cn(compact ? "mt-1.5" : "mt-2")}
                    >
                      <MeetingTranscriptPanel
                        eventId={card.calendarEventId}
                        joinUrl={card.joinUrl}
                        chatId={card.kind === "chat" ? card.threadKey : null}
                        issueId={card.issueId}
                        compact
                      />
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <TeamsApplyConfirmDialog
        open={applyCard != null}
        onOpenChange={(next) => {
          if (!next) setApplyCard(null);
        }}
        analysis={applyCard?.lastAnalysis}
        tasks={applyCard?.lastAnalysis?.tasks || []}
        events={applyEvents}
        threadKey={applyCard?.threadKey}
        kind={applyCard?.kind}
        title={applyCard?.title}
        applying={dayAnalysis.applying}
        onApply={(payload) => {
          void (async () => {
            await dayAnalysis.apply(payload);
            await loadThreads(queryRef.current || undefined, true);
          })();
        }}
      />

      {flyoutPortalReady && flyoutPresence.mounted
        ? createPortal(
            <div className="fixed inset-0 z-[1000]">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "absolute inset-0 h-auto w-full rounded-none border-0 bg-black/20 p-0 transition-opacity ease-in-out hover:bg-black/20",
                  flyoutPresence.entered ? "opacity-100" : "opacity-0"
                )}
                style={{ transitionDuration: `${MARI_FLYOUT_MS}ms` }}
                aria-label={t("microsoft.closeFlyout")}
                onClick={closeFlyout}
              />
              <MariMainFlyoutShell open={flyoutPresence.entered}>
                <div
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                  role="dialog"
                  aria-modal="true"
                  aria-label={threadTitle}
                >
                  <div className="flex shrink-0 items-start gap-2 border-b border-border/50 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[0.9375rem] font-bold leading-snug tracking-tight break-words">
                        {threadTitle}
                      </h2>
                    </div>
                    <TeamsAnalysisTrigger
                      loading={threadAnalysis.loading}
                      disabled={msgLoading || messages.length === 0}
                      label={
                        threadAnalysis.analysis
                          ? t("workspace.reanalyze")
                          : t("tickets.analyze")
                      }
                      onAnalyze={analyzeOpenThread}
                      className="mt-0.5 shrink-0"
                    />
                    {threadWebUrl ? (
                      <a
                        href={threadWebUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "mt-0.5 shrink-0 gap-1.5 whitespace-nowrap"
                        )}
                      >
                        {t("microsoft.inTeams")}
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      onClick={closeFlyout}
                      aria-label={t("common.close")}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
                    {threadChatType === "meeting" ||
                    threadJoinUrl ||
                    threadEventId ? (
                      <div className="mb-3">
                        <MeetingTranscriptPanel
                          chatId={threadChatId}
                          joinUrl={threadJoinUrl}
                          eventId={threadEventId}
                          compact
                        />
                      </div>
                    ) : null}
                    {msgLoading ? (
                      <p className="text-sm text-muted-foreground">
                        {t("microsoft.loadingMessages")}
                      </p>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {threadChatType === "meeting" ||
                        threadJoinUrl ||
                        threadEventId
                          ? t("microsoft.noChatMessages")
                          : t("microsoft.noMessagesInSlice")}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {messages.map((m) => (
                          <li
                            key={m.id}
                            className="rounded-2xl bg-muted px-3 py-2 text-sm"
                          >
                            <p className="text-[0.6875rem] font-semibold text-muted-foreground">
                              {m.from || t("common.unknown")}
                              {m.createdAt
                                ? ` · ${formatSwissDateTime(m.createdAt)}`
                                : ""}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap leading-snug">
                              {m.text}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="shrink-0 space-y-2.5 border-t border-border/50 px-4 py-3">
                    <TeamsAnalysisResults
                      compact
                      analysis={threadAnalysis.analysis}
                      usedAi={threadAnalysis.usedAi}
                      loading={threadAnalysis.loading}
                      applying={threadAnalysis.applying}
                      error={threadAnalysis.error}
                      status={threadAnalysis.status}
                      meta={threadAnalysis.meta}
                      onApply={(payload) => {
                        void (async () => {
                          await threadAnalysis.apply(payload);
                          await loadThreads(queryRef.current || undefined, true);
                        })();
                      }}
                    />
                  </div>
                </div>
              </MariMainFlyoutShell>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}

function InboxBadge({
  children,
  tone,
}: {
  children: string;
  tone?: TeamsInboxStatus | "ok" | "task" | "event";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[0.6875rem] font-medium",
        tone === "open" || tone === "later"
          ? "bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100"
          : tone === "done"
            ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100"
            : tone === "ok" || tone === "event"
              ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100"
              : tone === "task"
                ? "bg-violet-100 text-violet-950 dark:bg-violet-500/20 dark:text-violet-100"
                : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}
