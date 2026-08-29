"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

type Colleague = {
  key: string;
  source: "workbuddy" | "chat" | "self";
  userId: number | null;
  displayName: string;
  email: string | null;
  microsoftId: string | null;
  chatId: string | null;
};

export function TicketColleaguePingDialog({
  open,
  onOpenChange,
  issueId,
  ticketLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: number;
  ticketLabel: string;
}) {
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNeedsReconnect(false);
    setSelectedKey(null);
    setQuery("");
    void fetch("/api/microsoft/colleagues")
      .then(async (res) => {
        const json = (await res.json()) as {
          error?: string;
          colleagues?: Colleague[];
          hasChatCreateScope?: boolean;
          hasChatMessageSendScope?: boolean;
        };
        if (cancelled) return;
        if (!res.ok) {
          setNeedsReconnect(res.status === 400 || res.status === 403);
          throw new Error(json.error || "Kollegen laden fehlgeschlagen");
        }
        setColleagues(json.colleagues || []);
        if (!json.hasChatCreateScope || !json.hasChatMessageSendScope) {
          setNeedsReconnect(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return colleagues;
    return colleagues.filter((c) => {
      const hay = `${c.displayName} ${c.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [colleagues, query]);

  const selected = filtered.find((c) => c.key === selectedKey) ?? null;

  async function send() {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${issueId}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colleagueUserId: selected.userId ?? undefined,
          microsoftId: selected.microsoftId ?? undefined,
          email: selected.email ?? undefined,
          existingChatId: selected.chatId ?? undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        needsReconnect?: boolean;
        created?: boolean;
      };
      if (!res.ok) {
        setNeedsReconnect(Boolean(json.needsReconnect));
        throw new Error(json.error || "Senden fehlgeschlagen");
      }
      showActionFeedback({
        headline: "Kollege informiert",
        detail: json.created
          ? "Neuer Teams-Chat, Nachricht gesendet."
          : "Nachricht im bestehenden Chat gesendet.",
        tone: "success",
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kollege informieren</DialogTitle>
          <DialogDescription>
            Teams-Nachricht zu Ticket #{issueId}
            {ticketLabel ? ` — ${ticketLabel}` : ""}.
          </DialogDescription>
        </DialogHeader>

        {needsReconnect ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30">
            Chat.Create oder ChatMessage.Send fehlt. Unter{" "}
            <a href="/account" className="underline underline-offset-2">
              Konto
            </a>{" "}
            Microsoft 365 <strong>Neu verbinden</strong>.
          </p>
        ) : null}

        <label className="sr-only" htmlFor="ticket-ping-colleague-q">
          Kollege suchen
        </label>
        <Input
          id="ticket-ping-colleague-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name oder E-Mail"
          autoComplete="off"
        />

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2
              className="size-4 animate-spin"
              strokeWidth={APP_ICON_STROKE}
            />
            Lade Kollegen…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {colleagues.length === 0
              ? "Keine Kollegen mit verbundenem Microsoft-Konto. Nur Personen, die WorkBuddy mit Microsoft verbunden haben (oder mit denen du schon einen 1:1-Chat hast)."
              : "Keine Treffer."}
          </p>
        ) : (
          <ul className="flex max-h-[min(20rem,50dvh)] flex-col gap-2 overflow-y-auto p-0.5">
            {filtered.map((c) => {
              const isOn = c.key === selectedKey;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(c.key)}
                    className={cn(
                      "flex min-h-11 w-full flex-col items-start rounded-2xl bg-card px-3 py-2 text-left shadow-sm ring-1 ring-foreground/10",
                      isOn
                        ? "ring-2 ring-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="text-sm font-medium leading-snug break-words">
                      {c.displayName}
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground break-words">
                      {c.source === "self"
                        ? "Testhilfe · Nachricht an dich selbst"
                        : c.email || "Microsoft verbunden"}
                      {c.source === "chat" ? " · bestehender Chat" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            disabled={!selected || sending}
            onClick={() => void send()}
          >
            {sending ? (
              <Loader2
                className="size-4 animate-spin"
                strokeWidth={APP_ICON_STROKE}
              />
            ) : (
              <Bell className="size-4" strokeWidth={APP_ICON_STROKE} />
            )}
            {sending ? "Sende…" : "In Teams senden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
