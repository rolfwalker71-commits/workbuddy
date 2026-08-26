"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
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
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type {
  TeamsAnalysisEvent,
  TeamsAnalysisReply,
  TeamsAnalysisTask,
  TeamsChatAnalysis,
} from "@/lib/microsoft/analyze-teams-chat";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export type TeamsAnalyzeRequest =
  | { scope: "day" }
  | { chatId: string }
  | { teamId: string; channelId: string };

type Picks = {
  tasks: Record<number, boolean>;
  events: Record<number, boolean>;
};

export function useTeamsAnalysis() {
  const [analysis, setAnalysis] = useState<TeamsChatAnalysis | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);

  function reset() {
    setAnalysis(null);
    setUsedAi(false);
    setError(null);
    setStatus(null);
    setMeta(null);
  }

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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Analyse fehlgeschlagen");
      setAnalysis(json.analysis as TeamsChatAnalysis);
      setUsedAi(Boolean(json.usedAi));
      if (json.scope === "day") {
        setMeta(
          `${json.chatsAnalyzed || 0} von ${json.chatsConsidered || 0} Chats (heute)`
        );
      } else {
        setMeta(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function apply(tasks: TeamsAnalysisTask[], events: TeamsAnalysisEvent[]) {
    setApplying(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/microsoft/teams/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks, events }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Übernehmen fehlgeschlagen");
      const bits = [
        json.taskOk ? `${json.taskOk} Aufgabe(n)` : null,
        json.eventOk ? `${json.eventOk} Termin(e)` : null,
      ].filter(Boolean);
      setStatus(
        bits.length
          ? `${bits.join(" · ")} in Outlook übernommen.`
          : "Nichts angelegt."
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
    run,
    apply,
    reset,
  };
}

export function TeamsAnalysisTrigger({
  loading,
  disabled,
  label = "Analysieren",
  onAnalyze,
  className,
}: {
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  onAnalyze: () => void;
  className?: string;
}) {
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
      {loading ? "Analyse läuft…" : label}
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
  onApply: (tasks: TeamsAnalysisTask[], events: TeamsAnalysisEvent[]) => void;
}) {
  const [picks, setPicks] = useState<Picks>({ tasks: {}, events: {} });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftTasks, setDraftTasks] = useState<TeamsAnalysisTask[]>([]);
  const [draftEvents, setDraftEvents] = useState<AnalysisDraftEvent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

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
    setDraftTasks(analysis.tasks.filter((_, i) => picks.tasks[i]));
    setDraftEvents(
      analysis.events
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
        }))
    );
    setConfirmOpen(true);
  }

  async function copyReply(reply: TeamsAnalysisReply, key: string) {
    try {
      await navigator.clipboard.writeText(reply.body);
      setCopied(key);
      window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 2000);
    } catch {
      setCopied(null);
    }
  }

  if (!analysis && !loading && !error) {
    return (
      <p className="text-xs text-muted-foreground">
        Analyse vorschlagen — nichts wird automatisch nach To Do oder Kalender
        geschrieben.
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
              {[usedAi ? "Firmen-KI" : null, meta].filter(Boolean).join(" · ")}
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
                <SuggestionGroup label="Aufgaben">
                  {cluster.tasks.map((t) => {
                    const i = analysis.tasks.indexOf(t);
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
                        title={t.title}
                        detail={[
                          t.dueDate ? `fällig ${toSwissDate(t.dueDate)}` : null,
                          t.reason,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    );
                  })}
                </SuggestionGroup>
              ) : null}

              {cluster.events.length > 0 ? (
                <SuggestionGroup label="Termine">
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
                            ? "ganztags"
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
                <SuggestionGroup label="Antwort-Entwürfe">
                  {cluster.replies.map((r, ri) => {
                    const key = `r-${ci}-${ri}`;
                    return (
                      <div
                        key={key}
                        className="rounded-xl bg-background px-2.5 py-2 ring-1 ring-border/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">
                            An {r.to || "Chat"}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 gap-1"
                            onClick={() => void copyReply(r, key)}
                          >
                            {copied === key ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                            {copied === key ? "Kopiert" : "Kopieren"}
                          </Button>
                        </div>
                        {r.reason ? (
                          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                            {r.reason}
                          </p>
                        ) : null}
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-foreground/80">
                          {r.body}
                        </p>
                      </div>
                    );
                  })}
                </SuggestionGroup>
              ) : null}

              {cluster.tasks.length +
                cluster.events.length +
                cluster.replies.length ===
              0 ? (
                <p className="text-xs text-muted-foreground">
                  Keine Aufgaben, Termine oder Antworten erkannt.
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
                {`Ausgewählte prüfen (${selectedCount})`}
              </Button>
              <p className="text-[0.6875rem] text-muted-foreground">
                Übernahme nach Outlook: Aufgaben → To Do, Termine → Kalender.
                Antworten nur kopieren (kein Senden in Teams).
              </p>
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Analysiert Chat…</p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle>Übernehmen bestätigen</DialogTitle>
            <DialogDescription>
              Texte und Daten bei Bedarf anpassen, dann bei Outlook anlegen.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            {draftTasks.map((t, i) => (
              <div
                key={`dt-${i}`}
                className="space-y-2 rounded-lg border border-border/60 p-3"
              >
                <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Aufgabe · Outlook To Do
                  {t.sourceChatTitle ? ` · ${t.sourceChatTitle}` : ""}
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
                calendarLabel="Outlook Kalender"
                slotProvider="microsoft"
                disabled={applying}
                onChange={(next) =>
                  setDraftEvents((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, ...next } : x))
                  )
                }
              />
            ))}
          </div>
          <DialogFooter className="flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-col sm:space-x-0">
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
                  draftTasks.length + draftEvents.length === 0 ||
                  analysisEventsNeedSlot(draftEvents)
                }
                onClick={() => {
                  const events: TeamsAnalysisEvent[] = draftEvents.map((ev) => ({
                    title: ev.title,
                    date: ev.date,
                    startTime: ev.startTime || null,
                    endTime: ev.endTime || null,
                    allDay: ev.allDay ?? !ev.startTime,
                    location: ev.location || null,
                    notes: ev.notes || null,
                    reason: ev.reason,
                  }));
                  setConfirmOpen(false);
                  onApply(draftTasks, events);
                }}
              >
                {applying ? "…" : "In Outlook anlegen"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
