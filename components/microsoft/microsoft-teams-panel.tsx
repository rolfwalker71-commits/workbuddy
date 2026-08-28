"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  EyeOff,
  Hash,
  Inbox,
  MessageSquare,
  RefreshCw,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  buildTeamsInboxCards,
  inboxCardCanApply,
  inboxStatusLabel,
  isTeamsInboxActiveToday,
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
  label: string;
  icon: typeof Calendar;
}> = [
  { id: "today", label: "Heute", icon: Calendar },
  { id: "open", label: "Offen", icon: Inbox },
  { id: "done", label: "Erledigt", icon: CheckCircle2 },
];

function inboxTimeLabel(iso: string | null, todayYmd: string): string {
  if (!iso) return "";
  if (isTeamsInboxActiveToday(iso, todayYmd)) {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? zurichHm(d) : formatSwissDateTime(iso);
  }
  return formatSwissDateTime(iso);
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
  const todayYmd = zurichYmd();
  const [filter, setFilter] = useState<TeamsInboxFilter>("today");
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
  const [threadTitle, setThreadTitle] = useState("Chat");
  const [threadWebUrl, setThreadWebUrl] = useState<string | null>(null);
  const [threadChatId, setThreadChatId] = useState<string | null>(null);
  const [threadChatType, setThreadChatType] =
    useState<ChatItem["chatType"] | null>(null);
  const [threadJoinUrl, setThreadJoinUrl] = useState<string | null>(null);
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
      if (!res.ok) throw new Error(json.error || "Chats laden fehlgeschlagen");
      setChats((json.chats || []) as ChatItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChats(false);
    }
  }, []);

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
      if (!res.ok) throw new Error(json.error || "Kanäle laden fehlgeschlagen");
      setTeams((json.teams || []) as TeamItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await fetch("/api/microsoft/teams/threads");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Inbox laden fehlgeschlagen");
      setThreads((json.threads || []) as TeamsInboxThreadRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void loadChats();
    void loadChannels();
    void loadThreads();
  }, [loadChats, loadChannels, loadThreads]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (dayAnalysis.loading) return;
    void loadThreads();
  }, [dayAnalysis.analysis, dayAnalysis.threadKeys, dayAnalysis.loading, loadThreads]);

  useEffect(() => {
    if (!ranDayRef.current || dayAnalysis.loading) return;
    ranDayRef.current = false;
    if (dayAnalysis.error) {
      showActionFeedback({
        headline: "Tagesanalyse fehlgeschlagen",
        detail: dayAnalysis.error,
        tone: "error",
      });
      return;
    }
    if (dayAnalysis.analysis) {
      showActionFeedback({
        headline: "Tagesanalyse fertig",
        detail: dayAnalysis.meta || "Karten sind gestempelt.",
      });
    }
  }, [dayAnalysis.analysis, dayAnalysis.error, dayAnalysis.loading, dayAnalysis.meta]);

  useEffect(() => {
    const onInbox = () => {
      void loadThreads();
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
    resetThread();
    setMsgLoading(true);
    try {
      const res = await fetch(
        `/api/microsoft/teams/messages?chatId=${encodeURIComponent(chat.id)}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Nachrichten fehlgeschlagen");
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
      if (!res.ok) throw new Error(json.error || "Nachrichten fehlgeschlagen");
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
      }),
    [
      chats,
      channels,
      threads,
      dayAnalysis.analysis,
      dayAnalysis.threadKeys,
      todayYmd,
      filter,
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
      if (!res.ok) throw new Error(json.error || "Status speichern fehlgeschlagen");
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
            Eine Inbox für Chats und Kanäle. Analyse legt nichts an, bevor du
            bestätigst.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeamsAnalysisTrigger
            loading={dayAnalysis.loading}
            disabled={loadingChats}
            label={
              dayAnalysis.analysis ? "Neu analysieren" : "Tag analysieren"
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
            Aktualisieren
          </Button>
        </div>
      </div>

      <div
        className={segmentedTrackClass}
        role="tablist"
        aria-label="Teams-Inbox"
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
              {item.label}
            </Button>
          );
        })}
      </div>

      {needsChannelReconnect || needsChatReconnect ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30">
          {needsChannelReconnect
            ? "Neue Team- und Kanal-Rechte sind in Entra frei — dein Token hat sie noch nicht. Unter "
            : "Neue Teams-Rechte sind aktiv — bitte unter "}
          <a href="/account" className="font-medium underline underline-offset-2">
            Konto
          </a>{" "}
          Microsoft 365 <strong>Neu verbinden</strong>
          {needsChannelReconnect
            ? ", damit Buddy deine Teams und Kanäle lädt."
            : " (Chat + Senden + Transkripte)."}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {dayAnalysis.loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Tagesanalyse läuft — Karten werden gestempelt…
        </p>
      ) : dayAnalysis.error ? (
        <p className="text-sm text-destructive" role="alert">
          {dayAnalysis.error}
        </p>
      ) : null}

      {loading && cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Inbox…</p>
      ) : cards.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/50">
          {filter === "today"
            ? "Heute nichts Offenes. Ignorierte Threads bleiben ausgeblendet."
            : filter === "done"
              ? "Keine erledigten Threads."
              : "Nichts Offen oder auf Später."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {cards.map((card) => {
            const active =
              (open?.kind === "chat" && open.id === card.threadKey) ||
              (open?.kind === "channel" &&
                card.teamId === open.teamId &&
                card.channelId === open.channelId);
            const Icon = cardIcon(card);
            const busy = patchingKey === card.threadKey;
            const time = inboxTimeLabel(card.lastActiveAt, todayYmd);
            return (
              <li key={card.threadKey}>
                <article
                  className={cn(
                    "rounded-2xl bg-card px-3.5 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1",
                    active ? "ring-primary" : "ring-border/50 hover:bg-muted"
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => openCard(card)}
                    className="flex w-full items-start gap-3 rounded-xl text-left"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Icon className="size-4" strokeWidth={APP_ICON_STROKE} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-semibold leading-snug break-words">
                          {card.title}
                        </span>
                        <span className="flex max-w-[55%] flex-wrap justify-end gap-1">
                          {card.inbox !== "open" || filter !== "open" ? (
                            <InboxBadge tone={card.inbox}>
                              {inboxStatusLabel(card.inbox)}
                            </InboxBadge>
                          ) : null}
                          <InboxBadge>{card.typeLabel}</InboxBadge>
                          {card.analyzed ? (
                            <InboxBadge tone="ok">Analysiert</InboxBadge>
                          ) : null}
                          {card.taskCount > 0 ? (
                            <InboxBadge tone="task">
                              {card.taskCount === 1
                                ? "1 Aufgabe"
                                : `${card.taskCount} Aufgaben`}
                            </InboxBadge>
                          ) : null}
                          {card.eventCount > 0 ? (
                            <InboxBadge tone="event">
                              {card.eventCount === 1
                                ? "1 Termin"
                                : `${card.eventCount} Termine`}
                            </InboxBadge>
                          ) : null}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {card.typeLabel}
                        {time ? ` · ${time}` : ""}
                      </span>
                      {card.preview ? (
                        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                          {card.preview}
                        </span>
                      ) : null}
                      {card.issueId ? (
                        <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-950 dark:bg-amber-500/20 dark:text-amber-100">
                          Ticket #{card.issueId}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
                    {card.inbox === "later" || card.inbox === "done" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className="h-8 gap-1 px-2.5"
                        onClick={() => void patchInbox(card, "open")}
                      >
                        <Inbox className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        Offen
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className="h-8 gap-1 px-2.5"
                        onClick={() => void patchInbox(card, "later")}
                      >
                        <Clock3 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        Später
                      </Button>
                    )}
                    {card.inbox !== "done" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className="h-8 gap-1 px-2.5"
                        onClick={() => void patchInbox(card, "done")}
                      >
                        <Check className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        Erledigt
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      className="h-8 gap-1 px-2.5"
                      onClick={() => void patchInbox(card, "ignored")}
                    >
                      <EyeOff className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                      Ignorieren
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || dayAnalysis.applying}
                      className="ml-auto h-8 gap-1 px-2.5"
                      onClick={() => startApply(card)}
                    >
                      <UserPlus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                      Übernehmen
                    </Button>
                  </div>
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
            await loadThreads();
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
                aria-label="Flyout schliessen"
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
                          ? "Neu analysieren"
                          : "Analysieren"
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
                        In Teams
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      onClick={closeFlyout}
                      aria-label="Schliessen"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
                    {threadChatType === "meeting" || threadJoinUrl ? (
                      <div className="mb-3">
                        <MeetingTranscriptPanel
                          chatId={threadChatId}
                          joinUrl={threadJoinUrl}
                          compact
                        />
                      </div>
                    ) : null}
                    {msgLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Lade Nachrichten…
                      </p>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {threadChatType === "meeting" || threadJoinUrl
                          ? "Keine Chat-Nachrichten — der Inhalt sitzt meist im Transkript darüber."
                          : "Keine Nachrichten in diesem Ausschnitt."}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {messages.map((m) => (
                          <li
                            key={m.id}
                            className="rounded-2xl bg-muted px-3 py-2 text-sm"
                          >
                            <p className="text-[0.6875rem] font-semibold text-muted-foreground">
                              {m.from || "Unbekannt"}
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
                          await loadThreads();
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
