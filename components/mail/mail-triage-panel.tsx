"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMailSuggestionDetail } from "@/lib/mail/format-suggestion";
import type { MailSuggestion } from "@/lib/mail/mail-action-schema";
import type { StoredMailAnalysis } from "@/lib/mail/mail-heuristic";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";

type Provider = "microsoft" | "google";

function suggestionKey(s: MailSuggestion, index: number): string {
  return `${s.kind}-${index}-${s.title}`;
}

export function MailTriagePanel({
  provider,
  onPendingChange,
}: {
  provider: Provider;
  onPendingChange?: (n: number) => void;
}) {
  const [pending, setPending] = useState<StoredMailAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${provider}/mail/triage`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Triage laden fehlgeschlagen");
      const rows = (data.pending || []) as StoredMailAnalysis[];
      setPending(rows);
      const n = Number(data.pendingCount) || rows.length;
      onPendingChange?.(n);
      const next: Record<string, boolean> = {};
      for (const row of rows) {
        for (const [i, s] of (row.analysis?.suggestions || []).entries()) {
          next[`${row.messageId}:${suggestionKey(s, i)}`] = true;
        }
      }
      setSelected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [provider, onPendingChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(messageId: string) {
    setBusyId(messageId);
    setError(null);
    try {
      const res = await fetch(`/api/${provider}/mail/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, action: "dismiss" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verwerfen fehlgeschlagen");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function apply(row: StoredMailAnalysis) {
    const suggestions = row.analysis?.suggestions || [];
    const picked = suggestions.filter((s, i) =>
      selected[`${row.messageId}:${suggestionKey(s, i)}`]
    );
    if (picked.length === 0) {
      setError("Mindestens einen Vorschlag wählen.");
      return;
    }
    setBusyId(row.messageId);
    setError(null);
    try {
      if (provider === "microsoft") {
        const res = await fetch(
          `/api/microsoft/mail/${encodeURIComponent(row.messageId)}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actions: picked.map((s) => ({
                kind: s.kind,
                title: s.title,
                notes: s.notes ?? null,
                startDate: s.startDate ?? null,
                startTime: s.startTime ?? null,
                endDate: s.endDate ?? null,
                endTime: s.endTime ?? null,
                allDay: s.allDay,
                location: s.location ?? null,
                dueDate: s.dueDate ?? null,
                reference: s.reference ?? null,
                calendarId: s.calendarId ?? null,
                patchEventId: s.patchEventId ?? null,
              })),
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
      } else {
        const tasks = picked
          .filter((s) => s.kind === "task")
          .map((s) => ({
            title: s.title,
            notes: s.notes ?? null,
            dueDate: s.dueDate ?? null,
            sourceMailId: row.messageId,
            sourceSubject: row.subject,
          }));
        const events = picked
          .filter((s) => s.kind === "event")
          .map((s) => ({
            title: s.title,
            date:
              s.startDate ||
              new Intl.DateTimeFormat("en-CA", {
                timeZone: "Europe/Zurich",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date()),
            startTime: s.startTime ?? null,
            endTime: s.endTime ?? null,
            allDay: s.allDay,
            location: s.location ?? null,
            notes: s.notes ?? null,
            sourceMailId: row.messageId,
            sourceSubject: row.subject,
          }));
        if (tasks.length === 0 && events.length === 0) {
          throw new Error(
            "Für Gmail können hier Aufgaben und Termine übernommen werden."
          );
        }
        const res = await fetch("/api/google/mail/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks, events, replies: [] }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Übernehmen fehlgeschlagen");
        await fetch("/api/google/mail/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: row.messageId,
            action: "applied",
          }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[0.9375rem] font-semibold">Mail-Triage</h2>
          <p className="text-xs text-muted-foreground">
            Offene Vorschläge aus der Einzelmail-Analyse — übernehmen oder
            überspringen.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw
            className={cn("size-3.5", loading && "animate-spin")}
            strokeWidth={APP_ICON_STROKE}
          />
          Aktualisieren
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {loading && pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade offene Vorschläge…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine offenen Triage-Vorschläge.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.map((row) => {
            const suggestions = row.analysis?.suggestions || [];
            return (
              <li key={row.messageId}>
                <Card className="border-border/70">
                  <CardContent className="space-y-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug">
                        {row.subject || "(kein Betreff)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.fromName || row.fromEmail || "Absender unbekannt"}
                      </p>
                      {row.summary ? (
                        <p className="mt-1 text-sm leading-relaxed">
                          {row.summary}
                        </p>
                      ) : null}
                    </div>
                    {suggestions.length > 0 ? (
                      <ul className="space-y-1.5">
                        {suggestions.map((s, i) => {
                          const key = `${row.messageId}:${suggestionKey(s, i)}`;
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                                <input
                                  type="checkbox"
                                  className="mt-1 size-4 accent-foreground"
                                  checked={selected[key] !== false}
                                  onChange={(e) =>
                                    setSelected((prev) => ({
                                      ...prev,
                                      [key]: e.target.checked,
                                    }))
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <Badge
                                      variant="secondary"
                                      className="text-[0.625rem]"
                                    >
                                      {s.kind}
                                    </Badge>
                                    <span className="text-sm font-medium">
                                      {s.title}
                                    </span>
                                  </span>
                                  {formatMailSuggestionDetail(s) ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {formatMailSuggestionDetail(s)}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === row.messageId}
                        onClick={() => void apply(row)}
                      >
                        <Check className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        Übernehmen
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.messageId}
                        onClick={() => void dismiss(row.messageId)}
                      >
                        <X className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                        Überspringen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {pending.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          {pending.length} offen
        </p>
      ) : null}
    </section>
  );
}
