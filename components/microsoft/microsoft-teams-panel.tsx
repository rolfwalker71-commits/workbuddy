"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, MessageSquare, RefreshCw, Users, Video } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { MicrosoftTeamsLogo } from "@/components/branding/provider-logos";
import {
  MicrosoftTaskSuggestions,
  type SuggestedTask,
} from "@/components/microsoft/microsoft-task-suggestions";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
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

export function MicrosoftTeamsPanel() {
  const [view, setView] = useState<TeamsView>("chats");
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsChatReconnect, setNeedsChatReconnect] = useState(false);
  const [needsChannelReconnect, setNeedsChannelReconnect] = useState(false);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);

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
    setSuggestions([]);
    setUsedAi(false);
    setTaskError(null);
    setTaskStatus(null);
  }

  async function openChat(chat: ChatItem) {
    setOpen({ kind: "chat", id: chat.id });
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

  async function suggestFromOpen() {
    if (!open) return;
    setSuggesting(true);
    setTaskError(null);
    setTaskStatus(null);
    try {
      const body =
        open.kind === "chat"
          ? { chatId: open.id }
          : { teamId: open.teamId, channelId: open.channelId };
      const res = await fetch("/api/microsoft/teams/suggest-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Vorschläge fehlgeschlagen");
      setSuggestions((json.suggestions || []) as SuggestedTask[]);
      setUsedAi(Boolean(json.usedAi));
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(false);
    }
  }

  async function applyTasks(selected: SuggestedTask[]) {
    setApplying(true);
    setTaskError(null);
    setTaskStatus(null);
    try {
      let ok = 0;
      for (const task of selected) {
        const res = await fetch("/api/microsoft/todo/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: task.title,
            notes: task.notes || task.reason || null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "To Do anlegen fehlgeschlagen");
        ok += 1;
      }
      setTaskStatus(
        ok === 1 ? "1 Aufgabe in To Do übernommen." : `${ok} Aufgaben in To Do übernommen.`
      );
      setSuggestions((prev) =>
        prev.filter((s) => !selected.some((x) => x.title === s.title))
      );
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  const openChatMeta =
    open?.kind === "chat" ? chats.find((c) => c.id === open.id) || null : null;
  const openChannelMeta =
    open?.kind === "channel"
      ? teams
          .flatMap((t) => t.channels)
          .find((c) => c.teamId === open.teamId && c.id === open.channelId) ||
        null
      : null;
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
            ganze Unternehmen. Offene Punkte werden nur nach «Aufgaben
            übernehmen» nach To Do gelegt.
          </p>
        </div>
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

      {open ? (
        <div className="space-y-3 rounded-2xl bg-card p-3 shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1 ring-border/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold leading-snug break-words">
              {open.kind === "chat"
                ? openChatMeta?.title || "Chat"
                : openChannelMeta
                  ? `${openChannelMeta.teamName} · ${openChannelMeta.name}`
                  : "Kanal"}
            </p>
            {(open.kind === "chat" ? openChatMeta?.webUrl : openChannelMeta?.webUrl) ? (
              <a
                href={
                  (open.kind === "chat"
                    ? openChatMeta?.webUrl
                    : openChannelMeta?.webUrl) || "#"
                }
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-1.5"
                )}
              >
                In Teams
              </a>
            ) : null}
          </div>
          {msgLoading ? (
            <p className="text-sm text-muted-foreground">Lade Nachrichten…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Nachrichten in diesem Ausschnitt.
            </p>
          ) : (
            <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-2xl bg-muted px-3 py-2 text-sm"
                >
                  <p className="text-[0.6875rem] font-semibold text-muted-foreground">
                    {m.from || "Unbekannt"}
                    {m.createdAt ? ` · ${formatSwissDateTime(m.createdAt)}` : ""}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap leading-snug">
                    {m.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <MicrosoftTaskSuggestions
            suggestions={suggestions}
            usedAi={usedAi}
            loading={suggesting}
            applying={applying}
            error={taskError}
            onSuggest={() => void suggestFromOpen()}
            onApply={(sel) => void applyTasks(sel)}
            emptyHint="Vorschläge erscheinen hier — nichts wird automatisch nach To Do geschrieben."
          />
          {taskStatus ? (
            <p className="text-sm text-emerald-700" role="status">
              {taskStatus}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
