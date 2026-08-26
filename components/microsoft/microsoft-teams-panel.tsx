"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Hash, MessageSquare, RefreshCw, Users, Video, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { MicrosoftTeamsLogo } from "@/components/branding/provider-logos";
import {
  TeamsAnalysisResults,
  TeamsAnalysisTrigger,
  useTeamsAnalysis,
} from "@/components/microsoft/microsoft-teams-analysis";
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
import { formatSwissDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

type ChatItem = {
  id: string;
  title: string;
  chatType: "oneOnOne" | "group" | "meeting" | "unknown";
  lastUpdatedAt: string | null;
  preview: string | null;
  webUrl: string | null;
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

type TeamsView = "chats" | "channels";

type OpenTarget =
  | { kind: "chat"; id: string }
  | { kind: "channel"; teamId: string; channelId: string };

function typeLabel(t: ChatItem["chatType"]): string {
  if (t === "meeting") return "Meeting";
  if (t === "group") return "Gruppe";
  if (t === "oneOnOne") return "Chat";
  return "Teams";
}

function membershipLabel(t: ChannelItem["membershipType"]): string | null {
  if (t === "private") return "privat";
  if (t === "shared") return "geteilt";
  return null;
}

export function MicrosoftTeamsPanel({
  initialChatId = null,
}: {
  initialChatId?: string | null;
}) {
  const [view, setView] = useState<TeamsView>("chats");
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsChatReconnect, setNeedsChatReconnect] = useState(false);
  const [needsChannelReconnect, setNeedsChannelReconnect] = useState(false);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [threadTitle, setThreadTitle] = useState("Chat");
  const [threadWebUrl, setThreadWebUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const threadAnalysis = useTeamsAnalysis();
  const dayAnalysis = useTeamsAnalysis();
  const openedFromUrl = useRef(false);
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

  const refresh = useCallback(() => {
    void loadChats();
    void loadChannels();
  }, [loadChats, loadChannels]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    setOpen({ kind: "chat", id: chat.id });
    setThreadTitle(chat.title);
    setThreadWebUrl(chat.webUrl);
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

  async function openChannel(channel: ChannelItem) {
    setOpen({
      kind: "channel",
      teamId: channel.teamId,
      channelId: channel.id,
    });
    setThreadTitle(`${channel.teamName} · ${channel.name}`);
    setThreadWebUrl(channel.webUrl);
    resetThread();
    setMsgLoading(true);
    try {
      const qs = new URLSearchParams({
        teamId: channel.teamId,
        channelId: channel.id,
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

  const loading = view === "chats" ? loadingChats : loadingChannels;
  const channelCount = teams.reduce((n, t) => n + t.channels.length, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
            <MicrosoftTeamsLogo className="size-4" />
            Teams
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Deine Chats und die Teams, in denen du Mitglied bist — nicht das
            ganze Unternehmen. Analyse legt nichts an, bevor du bestätigst.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === "chats" ? (
            <TeamsAnalysisTrigger
              loading={dayAnalysis.loading}
              disabled={loadingChats || chats.length === 0}
              label={
                dayAnalysis.analysis ? "Neu analysieren" : "Tag analysieren"
              }
              onAnalyze={() => void dayAnalysis.run({ scope: "day" })}
            />
          ) : null}
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
        aria-label="Teams-Ansicht"
      >
        <Button
          type="button"
          variant="ghost"
          role="tab"
          data-segment="true"
          aria-selected={view === "chats"}
          className={segmentedTriggerClass(view === "chats")}
          onClick={() => setView("chats")}
        >
          <MessageSquare className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
          Chats
        </Button>
        <Button
          type="button"
          variant="ghost"
          role="tab"
          data-segment="true"
          aria-selected={view === "channels"}
          className={segmentedTriggerClass(view === "channels")}
          onClick={() => setView("channels")}
        >
          <Hash className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
          Kanäle
        </Button>
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
            : " (Chat + Transkripte)."}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {view === "chats" &&
      (dayAnalysis.analysis || dayAnalysis.loading || dayAnalysis.error) ? (
        <div className="rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border/50">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Tag analysieren
          </p>
          <div className="mt-2">
            <TeamsAnalysisResults
              analysis={dayAnalysis.analysis}
              usedAi={dayAnalysis.usedAi}
              loading={dayAnalysis.loading}
              applying={dayAnalysis.applying}
              error={dayAnalysis.error}
              status={dayAnalysis.status}
              meta={dayAnalysis.meta}
              onApply={(tasks, events) => void dayAnalysis.apply(tasks, events)}
            />
          </div>
        </div>
      ) : null}

      {view === "chats" ? (
        loadingChats && chats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Chats…</p>
        ) : !loadingChats && chats.length === 0 && !needsChatReconnect ? (
          <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/50">
            Keine Chats gefunden. Kanäle deiner Teams findest du unter «Kanäle».
          </p>
        ) : (
          <ul className="space-y-2.5">
            {chats.map((chat) => {
              const active = open?.kind === "chat" && open.id === chat.id;
              return (
                <li key={chat.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => void openChat(chat)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl bg-card px-3.5 py-3 text-left shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1",
                      active
                        ? "ring-primary"
                        : "ring-border/50 hover:bg-muted"
                    )}
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                      {chat.chatType === "meeting" ? (
                        <Video className="size-4" strokeWidth={APP_ICON_STROKE} />
                      ) : chat.chatType === "group" ? (
                        <Users className="size-4" strokeWidth={APP_ICON_STROKE} />
                      ) : (
                        <MessageSquare
                          className="size-4"
                          strokeWidth={APP_ICON_STROKE}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug break-words">
                        {chat.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {typeLabel(chat.chatType)}
                        {chat.lastUpdatedAt
                          ? ` · ${formatSwissDateTime(chat.lastUpdatedAt)}`
                          : ""}
                      </span>
                      {chat.preview ? (
                        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                          {chat.preview}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : loadingChannels && teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Teams und Kanäle…</p>
      ) : !loadingChannels && teams.length === 0 && !needsChannelReconnect ? (
        <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/50">
          Keine Teams gefunden. Buddy listet nur Teams, in denen du Mitglied
          bist.
        </p>
      ) : !loadingChannels && channelCount === 0 && !needsChannelReconnect ? (
        <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/50">
          {teams.length === 1
            ? `Team «${teams[0].name}» hat keine sichtbaren Kanäle.`
            : `${teams.length} Teams, aber keine sichtbaren Kanäle.`}
        </p>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <section key={team.id} className="space-y-2">
              <div className="px-1">
                <h3 className="text-sm font-semibold leading-snug break-words">
                  {team.name}
                </h3>
                {team.description ? (
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {team.description}
                  </p>
                ) : null}
              </div>
              {team.channels.length === 0 ? (
                <p className="rounded-2xl bg-card px-3.5 py-3 text-sm text-muted-foreground shadow-sm ring-1 ring-border/50">
                  Keine sichtbaren Kanäle in diesem Team.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {team.channels.map((channel) => {
                    const active =
                      open?.kind === "channel" &&
                      open.teamId === channel.teamId &&
                      open.channelId === channel.id;
                    const kind = membershipLabel(channel.membershipType);
                    return (
                      <li key={`${channel.teamId}:${channel.id}`}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => void openChannel(channel)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-2xl bg-card px-3.5 py-3 text-left shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1",
                            active
                              ? "ring-primary"
                              : "ring-border/50 hover:bg-muted"
                          )}
                        >
                          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                            <Hash
                              className="size-4"
                              strokeWidth={APP_ICON_STROKE}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold leading-snug break-words">
                              {channel.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {team.name}
                              {kind ? ` · ${kind}` : ""}
                            </span>
                            {channel.description ? (
                              <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                                {channel.description}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

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
                    {msgLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Lade Nachrichten…
                      </p>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Keine Nachrichten in diesem Ausschnitt.
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
                      onApply={(tasks, events) =>
                        void threadAnalysis.apply(tasks, events)
                      }
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
