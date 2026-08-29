"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ClipboardCheck, Copy, Send, Sparkles } from "lucide-react";
import { MariTicketSearchPicker, type MariTicketPick } from "@/components/maringo/mari-ticket-search-picker";
import { Button } from "@/components/ui/button";
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
  AnalysisEventDraftCard,
  analysisEventsNeedSlot,
  type AnalysisDraftEvent,
} from "@/components/mail/analysis-event-draft-card";
import { useT } from "@/components/i18n/locale-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MessageKey, TranslateParams } from "@/lib/i18n";
import type {
  TeamsAnalysisEvent,
  TeamsAnalysisReply,
  TeamsAnalysisTask,
  TeamsChatAnalysis,
} from "@/lib/microsoft/analyze-teams-chat";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export type TeamsApplyPrimary = "task" | "event";

export type TeamsApplyPayload = {
  tasks: TeamsAnalysisTask[];
  events: TeamsAnalysisEvent[];
  issueId?: number | null;
  threadKey?: string;
  kind?: "chat" | "channel";
  title?: string | null;
};

export type TeamsAnalyzeRequest =
  | { scope: "day" }
  | { chatId: string }
  | { teamId: string; channelId: string };

type Picks = {
  tasks: Record<number, boolean>;
  events: Record<number, boolean>;
};

type TeamsDraftEvent = AnalysisDraftEvent & {
  sourceChatId?: string | null;
  sourceChatTitle?: string | null;
};

function dayMetaFromJson(
  json: {
    chatsAnalyzed?: number;
    chatsConsidered?: number;
    channelsAnalyzed?: number;
    channelsConsidered?: number;
  },
  t: (key: MessageKey, params?: TranslateParams) => string
): string {
  const chats = t("microsoft.chatsOf", {
    done: json.chatsAnalyzed || 0,
    total: json.chatsConsidered || 0,
  });
  const channels = t("microsoft.channelsOf", {
    done: json.channelsAnalyzed || 0,
    total: json.channelsConsidered || 0,
  });
  return `${chats} · ${channels}${t("microsoft.todaySuffix")}`;
}

export function useTeamsAnalysis(options?: { hydrateDay?: boolean }) {
  const t = useT();
  const [analysis, setAnalysis] = useState<TeamsChatAnalysis | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [threadKeys, setThreadKeys] = useState<string[]>([]);

  function reset() {
    setAnalysis(null);
    setUsedAi(false);
    setError(null);
    setStatus(null);
    setMeta(null);
    setThreadKeys([]);
  }

  function applyDayJson(json: Record<string, unknown>) {
    const next =
      (json.analysis as TeamsChatAnalysis | null) ||
      ((json.job as { analysis?: TeamsChatAnalysis } | null)?.analysis ?? null);
    if (next) {
      setAnalysis(next);
      setUsedAi(Boolean(json.usedAi ?? (json.job as { usedAi?: boolean } | null)?.usedAi));
      setMeta(dayMetaFromJson(json, t));
    }
    const keys =
      (json.threadKeys as string[] | undefined) ||
      ((json.cached as { threadKeys?: string[] } | null)?.threadKeys) ||
      ((json.job as { threadKeys?: string[] } | null)?.threadKeys) ||
      [];
    if (Array.isArray(keys)) {
      setThreadKeys(keys.filter((k) => typeof k === "string" && k.trim()));
    }
    if (json.status === "error") {
      const job = json.job as { error?: string } | null;
      setError(
        (typeof json.error === "string" && json.error) ||
          job?.error ||
          t("microsoft.dayAnalysisFailedDot")
      );
    }
  }

  async function pollDayJob() {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch("/api/microsoft/teams/analyze");
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((json.error as string) || t("microsoft.analysisFailed"));
      if (json.status === "running") continue;
      applyDayJson(json);
      return;
    }
    throw new Error(t("microsoft.dayAnalysisSlow"));
  }

  useEffect(() => {
    if (!options?.hydrateDay) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/microsoft/teams/analyze");
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled || !res.ok) return;
        if (json.status === "running") {
          setLoading(true);
          await pollDayJob();
        } else {
          applyDayJson(json);
        }
      } catch {
        /* hydrate is best-effort */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [options?.hydrateDay]);

  async function run(body: TeamsAnalyzeRequest) {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/microsoft/teams/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 202 || json.status === "running") {
        await pollDayJob();
        return;
      }
      if (!res.ok) throw new Error((json.error as string) || t("microsoft.analysisFailed"));
      setAnalysis(json.analysis as TeamsChatAnalysis);
      setUsedAi(Boolean(json.usedAi));
      if (json.scope === "day") {
        setMeta(dayMetaFromJson(json, t));
      } else {
        setMeta(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function apply(payload: TeamsApplyPayload) {
    setApplying(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/microsoft/teams/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: payload.tasks,
          events: payload.events,
          issueId: payload.issueId ?? undefined,
          threadKey: payload.threadKey,
          kind: payload.kind,
          title: payload.title,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("common.actionFailed"));
      const bits = [
        json.taskOk ? t("microsoft.nTasksParen", { count: json.taskOk }) : null,
        json.eventOk ? t("microsoft.nEventsParen", { count: json.eventOk }) : null,
        json.issueId ? t("microsoft.ticketHash", { id: json.issueId }) : null,
      ].filter(Boolean);
      setStatus(
        bits.length
          ? t("microsoft.appliedBits", { bits: bits.join(" · ") })
          : t("microsoft.nothingCreated")
      );
      if (json.errors?.length) {
        setError((json.errors as string[]).join(" · "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  return {
    analysis,
    usedAi,
    loading,
    applying,
    error,
    status,
    meta,
    threadKeys,
    run,
    apply,
    reset,
  };
}

export function TeamsAnalysisTrigger({
  loading,
  disabled,
  label,
  onAnalyze,
  className,
}: {
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  onAnalyze: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <Button
      type="button"
      size="sm"
      disabled={disabled || loading}
      onClick={onAnalyze}
      className={cn("gap-1.5", className)}
    >
      <Sparkles
        className={cn("size-3.5", loading && "animate-pulse")}
        strokeWidth={APP_ICON_STROKE}
      />
      {loading ? t("microsoft.analysisRunning") : label ?? t("tickets.analyze")}
    </Button>
  );
}

export function TeamsAnalysisResults({
  analysis,
  usedAi,
  loading,
  applying,
  error,
  status,
  meta,
  compact,
  onApply,
}: {
  analysis: TeamsChatAnalysis | null;
  usedAi?: boolean;
  loading?: boolean;
  applying?: boolean;
  error?: string | null;
  status?: string | null;
  meta?: string | null;
  compact?: boolean;
  onApply: (payload: TeamsApplyPayload) => void;
}) {
  const t = useT();
  const [picks, setPicks] = useState<Picks>({ tasks: {}, events: {} });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftTasks, setDraftTasks] = useState<TeamsAnalysisTask[]>([]);
  const [draftEvents, setDraftEvents] = useState<TeamsDraftEvent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [sendHint, setSendHint] = useState<string | null>(null);
  const [canSend, setCanSend] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/microsoft/connection")
      .then((res) => res.json().catch(() => ({})))
      .then((json) => {
        if (!cancelled) {
          setCanSend(Boolean(json.hasChatMessageSendScope));
        }
      })
      .catch(() => {
        if (!cancelled) setCanSend(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPicks({ tasks: {}, events: {} });
    setConfirmOpen(false);
  }, [analysis]);

  const selectedCount = useMemo(() => {
    if (!analysis) return 0;
    return (
      analysis.tasks.filter((_, i) => picks.tasks[i]).length +
      analysis.events.filter((_, i) => picks.events[i]).length
    );
  }, [analysis, picks]);

  function openConfirm() {
    if (!analysis) return;
    const tasks = analysis.tasks.filter((_, i) => picks.tasks[i]);
    const events = analysis.events
      .filter((_, i) => picks.events[i])
      .map((ev) => ({
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
      }));
    setDraftTasks(tasks);
    setDraftEvents(events);
    setConfirmOpen(true);
  }

  async function copyReply(reply: TeamsAnalysisReply, key: string) {
    try {
      await navigator.clipboard.writeText(reply.body);
      setCopied(key);
      window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 2000);
      return true;
    } catch {
      setCopied(null);
      return false;
    }
  }

  async function sendReply(
    reply: TeamsAnalysisReply,
    threadKey: string,
    key: string
  ) {
    setSendHint(null);
    if (canSend === false || !threadKey) {
      await copyReply(reply, key);
      setSendHint(key);
      return;
    }
    setSending(key);
    try {
      const res = await fetch("/api/microsoft/teams/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.body, threadKey }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.needsReconnect) {
        await copyReply(reply, key);
        setCanSend(false);
        setSendHint(key);
        return;
      }
      if (!res.ok) {
        await copyReply(reply, key);
        setSendHint(key);
        return;
      }
      setSent(key);
      window.setTimeout(() => setSent((cur) => (cur === key ? null : cur)), 2500);
    } catch {
      await copyReply(reply, key);
      setSendHint(key);
    } finally {
      setSending(null);
    }
  }

  if (!analysis && !loading && !error) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("microsoft.suggestAnalysis")}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2.5", compact && "max-h-[40vh] overflow-y-auto")}>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="text-sm text-emerald-700" role="status">
          {status}
        </p>
      ) : null}
      {analysis ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm leading-snug">{analysis.summary}</p>
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              {[usedAi ? t("common.companyAi") : null, meta].filter(Boolean).join(" · ")}
            </p>
          </div>
          {analysis.clusters.map((cluster, ci) => (
            <div
              key={`${cluster.sourceChatId || cluster.sourceChatTitle}-${ci}`}
              className="space-y-2 rounded-2xl bg-card px-3 py-2.5 shadow-sm ring-1 ring-border/50"
            >
              {analysis.clusters.length > 1 ? (
                <p className="text-sm font-semibold leading-snug break-words">
                  {cluster.sourceChatTitle}
                </p>
              ) : null}
              {cluster.summary && analysis.clusters.length > 1 ? (
                <p className="text-xs leading-snug text-muted-foreground">
                  {cluster.summary}
                </p>
              ) : null}

              {cluster.tasks.length > 0 ? (
                <SuggestionGroup label={t("workspace.tasks")}>
                  {cluster.tasks.map((task) => {
                    const i = analysis.tasks.indexOf(task);
                    return (
                      <PickRow
                        key={`t-${ci}-${i}`}
                        checked={Boolean(picks.tasks[i])}
                        onChange={(on) =>
                          setPicks((prev) => ({
                            ...prev,
                            tasks: { ...prev.tasks, [i]: on },
                          }))
                        }
                        title={task.title}
                        detail={[
                          task.dueDate
                            ? t("common.dueOn", {
                                date: toSwissDate(task.dueDate),
                              })
                            : null,
                          task.reason,
                        ]}
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    );
                  })}
                </SuggestionGroup>
              ) : null}

              {cluster.events.length > 0 ? (
                <SuggestionGroup label={t("workspace.events")}>
                  {cluster.events.map((ev) => {
                    const i = analysis.events.indexOf(ev);
                    return (
                      <PickRow
                        key={`e-${ci}-${i}`}
                        checked={Boolean(picks.events[i])}
                        onChange={(on) =>
                          setPicks((prev) => ({
                            ...prev,
                            events: { ...prev.events, [i]: on },
                          }))
                        }
                        title={ev.title}
                        detail={[
                          toSwissDate(ev.date),
                          ev.allDay || !ev.startTime
                            ? t("workspace.allDayLower")
                            : `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}`,
                          ev.location,
                          ev.reason,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    );
                  })}
                </SuggestionGroup>
              ) : null}

              {cluster.replies.length > 0 ? (
                <SuggestionGroup label={t("workspace.replyDrafts")}>
                  {cluster.replies.map((r, ri) => {
                    const key = `r-${ci}-${ri}`;
                    const threadKey =
                      r.sourceChatId?.trim() ||
                      cluster.sourceChatId?.trim() ||
                      "";
                    const busy = sending === key;
                    return (
                      <div
                        key={key}
                        className="rounded-xl bg-background px-2.5 py-2 ring-1 ring-border/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">
                            {t("microsoft.toChat", { to: r.to || t("microsoft.chat") })}
                          </p>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1"
                              disabled={busy}
                              onClick={() => void copyReply(r, key)}
                            >
                              {copied === key ? (
                                <Check className="size-3.5" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              {copied === key ? t("common.copied") : t("common.copy")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 gap-1"
                              disabled={busy}
                              onClick={() => void sendReply(r, threadKey, key)}
                            >
                              {sent === key ? (
                                <Check className="size-3.5" />
                              ) : (
                                <Send className="size-3.5" />
                              )}
                              {busy
                                ? t("common.sending")
                                : sent === key
                                  ? t("microsoft.sent")
                                  : t("microsoft.sendInTeams")}
                            </Button>
                          </div>
                        </div>
                        {r.reason ? (
                          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                            {r.reason}
                          </p>
                        ) : null}
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-foreground/80">
                          {r.body}
                        </p>
                        {sendHint === key ? (
                          <p
                            className="mt-1.5 text-[0.6875rem] text-amber-800"
                            role="status"
                          >
                            {canSend === false ? (
                              <>
                                {t("microsoft.copiedReconnect", {
                                  account: t("common.account"),
                                })}
                              </>
                            ) : !threadKey ? (
                              t("microsoft.noChatTarget")
                            ) : (
                              t("microsoft.sendNotPossible")
                            )}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                  {canSend === false ? (
                    <p className="text-[0.6875rem] text-amber-800">
                      {t("microsoft.sendNeedsPermission", {
                        account: t("common.account"),
                      })}
                    </p>
                  ) : null}
                </SuggestionGroup>
              ) : null}

              {cluster.tasks.length +
                cluster.events.length +
                cluster.replies.length ===
              0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("microsoft.noItemsRecognised")}
                </p>
              ) : null}
            </div>
          ))}

          {analysis.tasks.length + analysis.events.length > 0 ? (
            <div className="space-y-1.5">
              <Button
                type="button"
                size="sm"
                disabled={applying || selectedCount === 0}
                onClick={openConfirm}
              >
                {t("workspace.reviewSelected", { count: selectedCount })}
              </Button>
              <p className="text-[0.6875rem] text-muted-foreground">
                {t("microsoft.primaryActionHint")}
              </p>
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t("microsoft.analysingChat")}</p>
      ) : null}

      <TeamsApplyConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        analysis={analysis}
        tasks={draftTasks}
        events={draftEvents}
        applying={applying}
        onApply={onApply}
      />
    </div>
  );
}

export function TeamsApplyConfirmDialog({
  open,
  onOpenChange,
  analysis,
  tasks,
  events,
  threadKey,
  kind,
  title,
  applying,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis?: TeamsChatAnalysis | null;
  tasks: TeamsAnalysisTask[];
  events: TeamsDraftEvent[];
  threadKey?: string;
  kind?: "chat" | "channel";
  title?: string | null;
  applying?: boolean;
  onApply: (payload: TeamsApplyPayload) => void;
}) {
  const t = useT();
  const [primary, setPrimary] = useState<TeamsApplyPrimary>("task");
  const [ticket, setTicket] = useState<MariTicketPick | null>(null);
  const [draftTasks, setDraftTasks] = useState<TeamsAnalysisTask[]>([]);
  const [draftEvents, setDraftEvents] = useState<TeamsDraftEvent[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraftTasks(tasks);
    setDraftEvents(events);
    setPrimary(tasks.length > 0 ? "task" : "event");
    setTicket(null);
    // Seed when the dialog opens or the target thread changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid resetting drafts on parent rerenders
  }, [open, threadKey]);

  const source =
    threadKey?.trim() ||
    draftTasks[0]?.sourceChatId ||
    draftEvents[0]?.sourceChatId ||
    analysis?.clusters[0]?.sourceChatId ||
    "";
  const applyTitle =
    title ||
    draftTasks[0]?.sourceChatTitle ||
    draftEvents[0]?.sourceChatTitle ||
    analysis?.clusters[0]?.sourceChatTitle ||
    null;
  const applyKind: "chat" | "channel" =
    kind ||
    (source.startsWith("19:")
      ? "chat"
      : source.includes(":")
        ? "channel"
        : "chat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <div className="flex items-start gap-3 pr-8">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <ClipboardCheck
                className="size-5 text-primary"
                strokeWidth={APP_ICON_STROKE}
                aria-hidden
              />
            </span>
            <div className="min-w-0">
              <DialogTitle>{t("microsoft.apply")}</DialogTitle>
              <DialogDescription>{t("microsoft.onePrimaryAction")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <div className="space-y-2" role="radiogroup" aria-label={t("microsoft.primaryAction")}>
            <p className="text-sm font-medium">{t("microsoft.choosePrimary")}</p>
            {draftTasks.length > 0 ? (
              <PrimaryActionCard
                checked={primary === "task"}
                onSelect={() => setPrimary("task")}
                label={t("microsoft.todo")}
                detail={t("microsoft.todoInOutlook", {
                  title: draftTasks[0]?.title || t("common.task"),
                })}
              />
            ) : null}
            {draftEvents.length > 0 ? (
              <PrimaryActionCard
                checked={primary === "event"}
                onSelect={() => setPrimary("event")}
                label={t("calendarUi.event")}
                detail={t("microsoft.createEventInCalendar")}
              />
            ) : null}
          </div>

          {primary === "task"
            ? draftTasks.map((task, i) => (
                <div
                  key={`dt-${i}`}
                  className="space-y-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border/50"
                >
                  <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("workspace.taskDestToDo")}
                    {task.sourceChatTitle ? ` · ${task.sourceChatTitle}` : ""}
                  </p>
                  <div className="space-y-1">
                    <Label>{t("common.title")}</Label>
                    <Input
                      value={task.title}
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
                    <Label>{t("microsoft.due")}</Label>
                    <Input
                      type="date"
                      value={task.dueDate || ""}
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
                    <Label>{t("microsoft.notes")}</Label>
                    <Textarea
                      rows={3}
                      value={task.notes || ""}
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
              ))
            : draftEvents.map((ev, i) => (
                <AnalysisEventDraftCard
                  key={`de-${i}`}
                  event={ev}
                  calendarLabel={t("workspace.outlookCalendar")}
                  slotProvider="microsoft"
                  disabled={applying}
                  onChange={(next) =>
                    setDraftEvents((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, ...next } : x))
                    )
                  }
                />
              ))}

          <MariTicketSearchPicker
            value={ticket}
            onChange={setTicket}
            disabled={applying}
          />
        </div>
        <DialogFooter className="flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-col sm:space-x-0">
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={applying}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={
                applying ||
                (primary === "task"
                  ? draftTasks.length === 0
                  : draftEvents.length === 0 ||
                    analysisEventsNeedSlot(draftEvents))
              }
              onClick={() => {
                const nextEvents: TeamsAnalysisEvent[] =
                  primary === "event"
                    ? draftEvents.map((ev) => ({
                        title: ev.title,
                        date: ev.date,
                        startTime: ev.startTime || null,
                        endTime: ev.endTime || null,
                        allDay: ev.allDay ?? !ev.startTime,
                        location: ev.location || null,
                        notes: ev.notes || null,
                        reason: ev.reason,
                        sourceChatId: ev.sourceChatId,
                        sourceChatTitle: ev.sourceChatTitle,
                      }))
                    : [];
                const nextTasks = primary === "task" ? draftTasks : [];
                onOpenChange(false);
                onApply({
                  tasks: nextTasks,
                  events: nextEvents,
                  issueId: ticket?.issueId ?? null,
                  threadKey: source || undefined,
                  kind: applyKind,
                  title: applyTitle,
                });
              }}
            >
              {applying ? "…" : t("microsoft.apply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrimaryActionCard({
  checked,
  onSelect,
  label,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left whitespace-normal shadow-sm ring-1 transition-colors",
        checked
          ? "bg-primary/10 ring-primary"
          : "bg-card ring-border/50 hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary" : "border-muted-foreground/40"
        )}
        aria-hidden
      >
        {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}

function SuggestionGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function PickRow({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  title: string;
  detail?: string;
}) {
  return (
    <label className="flex items-start gap-2 rounded-xl bg-background px-2.5 py-2 ring-1 ring-border/40">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-snug">{title}</span>
        {detail ? (
          <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}
