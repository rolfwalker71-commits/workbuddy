"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Stern zum Beobachten eines Tickets.
 *
 * Muss ein Geschwister der Zeilen-Schaltfläche sein, nicht darin — sonst öffnet
 * jeder Klick zusätzlich das Ticket.
 */
export function MariTicketWatchStar({
  issueId,
  title,
  watched,
  onChanged,
  className,
}: {
  issueId: number;
  title?: string | null;
  watched: boolean;
  onChanged?: (watched: boolean) => void;
  className?: string;
}) {
  const t = useT();
  const [on, setOn] = useState(watched);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setBusy(true);
    setError(null);
    setOn(next); // optimistisch
    try {
      const res = await fetch("/api/maringo/tickets/watch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ issueId, watched: next, title: title ?? null }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        watched?: boolean;
        error?: string;
      };
      if (!res.ok) {
        // Vor allem das Limit von 40 — sonst bliebe der Stern sichtbar an,
        // ohne dass je eine Meldung käme.
        setOn(!next);
        setError(data.error || t("errors.generic"));
        return;
      }
      const actual = Boolean(data.watched);
      setOn(actual);
      onChanged?.(actual);
    } catch {
      setOn(!next);
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("tickets.unwatch") : t("tickets.watch")}
      title={error || (on ? t("tickets.unwatch") : t("tickets.watch"))}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void toggle();
      }}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted",
        error && "ring-1 ring-destructive",
        className
      )}
    >
      <Star
        className={cn(
          "size-4",
          on ? "fill-amber-400 text-amber-500" : "text-muted-foreground"
        )}
      />
    </button>
  );
}
