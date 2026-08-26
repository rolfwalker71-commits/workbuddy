"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import {
  MicrosoftTaskSuggestions,
  type SuggestedTask,
} from "@/components/microsoft/microsoft-task-suggestions";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

type TranscriptPayload = {
  status: string;
  subject: string | null;
  text: string | null;
  hint: string;
  chatMessages?: Array<{
    id: string;
    createdAt: string | null;
    from: string | null;
    text: string;
  }>;
};

export function MeetingTranscriptPanel({
  eventId,
  joinUrl,
  issueId,
  calendarId,
  compact,
}: {
  eventId?: string | null;
  joinUrl?: string | null;
  issueId?: number | null;
  calendarId?: string | null;
  compact?: boolean;
}) {
  const [data, setData] = useState<TranscriptPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId && !joinUrl && issueId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNeedsReconnect(false);
    const qs = new URLSearchParams();
    if (eventId) qs.set("eventId", eventId);
    if (joinUrl) qs.set("joinUrl", joinUrl);
    if (calendarId) qs.set("calendarId", calendarId);
    if (issueId != null) qs.set("issueId", String(issueId));
    try {
      const res = await fetch(`/api/microsoft/teams/transcript?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (res.status === 403 && json.needsReconnect) {
        setNeedsReconnect(true);
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Transkript fehlgeschlagen");
      setData(json.transcript as TranscriptPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [calendarId, eventId, issueId, joinUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function suggest() {
    setSuggesting(true);
    setTaskError(null);
    setTaskStatus(null);
    try {
      const res = await fetch("/api/microsoft/teams/suggest-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: eventId || undefined,
          joinUrl: joinUrl || undefined,
          issueId: issueId ?? undefined,
        }),
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
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  if (!eventId && !joinUrl && issueId == null) return null;

  const chatFallback = data?.chatMessages?.length
    ? data.chatMessages
    : [];

  return (
    <div className="space-y-2 rounded-2xl bg-muted/40 px-3 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <FileText className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        Meeting-Transkript
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Suche Transkript…</p>
      ) : needsReconnect ? (
        <p className="text-sm text-amber-900 dark:text-amber-100">
          Transkript-Recht fehlt — unter Konto Microsoft 365 neu verbinden.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : data?.text ? (
        <pre
          className={cnText(compact)}
        >
          {data.text}
        </pre>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {data?.hint ||
              "Kein Transkript. Nur vorhanden, wenn die Aufnahme/Transkription im Meeting lief und fertig ist."}
          </p>
          {chatFallback.length > 0 ? (
            <ul className={cnList(compact)}>
              {chatFallback.map((m) => (
                <li key={m.id} className="text-sm leading-snug">
                  <span className="font-medium">{m.from || "Unbekannt"}: </span>
                  {m.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {data && (data.text || chatFallback.length > 0) ? (
        <MicrosoftTaskSuggestions
          suggestions={suggestions}
          usedAi={usedAi}
          loading={suggesting}
          applying={applying}
          error={taskError}
          onSuggest={() => void suggest()}
          onApply={(sel) => void applyTasks(sel)}
          suggestLabel="Restarbeit vorschlagen"
          emptyHint="Keine Restarbeit erkannt — oder noch nicht geprüft."
        />
      ) : null}
      {taskStatus ? (
        <p className="text-sm text-emerald-700" role="status">
          {taskStatus}
        </p>
      ) : null}
    </div>
  );
}

function cnText(compact?: boolean) {
  return compact
    ? "max-h-48 overflow-y-auto whitespace-pre-wrap text-[0.8125rem] leading-snug text-foreground"
    : "max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground";
}

function cnList(compact?: boolean) {
  return compact
    ? "max-h-40 space-y-1.5 overflow-y-auto"
    : "max-h-56 space-y-1.5 overflow-y-auto";
}
