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
import { useT } from "@/components/i18n/locale-provider";

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
  const t = useT();
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
    const loadCtrl = new AbortController();
    const loadTimer = window.setTimeout(() => loadCtrl.abort(), 15000);
    setLoading(true);
    setError(null);
    setNeedsReconnect(false);
    setSelectedKey(null);
    setQuery("");
    setColleagues([]);

    function applyPayload(
      json: {
        error?: string;
        colleagues?: Colleague[];
        hasChatCreateScope?: boolean;
        hasChatMessageSendScope?: boolean;
      },
      ok: boolean,
      status: number
    ) {
      const next = json.colleagues || [];
      if (next.length) setColleagues(next);
      if (
        json.hasChatCreateScope === false ||
        json.hasChatMessageSendScope === false
      ) {
        setNeedsReconnect(true);
      }
      if (!ok) {
        setNeedsReconnect(status === 400 || status === 403);
        throw new Error(json.error || t("tickets.loadColleaguesFailed"));
      }
    }

    function loadErrorMessage(err: unknown): string {
      if (err instanceof DOMException && err.name === "AbortError") {
        return t("tickets.loadColleaguesTimeout");
      }
      if (err instanceof Error && err.message.trim()) return err.message;
      return t("tickets.loadColleaguesFailed");
    }

    void fetch("/api/microsoft/colleagues", { signal: loadCtrl.signal })
      .then(async (res) => {
        const json = (await res.json()) as {
          error?: string;
          colleagues?: Colleague[];
          hasChatCreateScope?: boolean;
          hasChatMessageSendScope?: boolean;
        };
        if (cancelled) return;
        applyPayload(json, res.ok, res.status);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(loadErrorMessage(err));
      })
      .finally(() => {
        window.clearTimeout(loadTimer);
        if (!cancelled) setLoading(false);
        if (cancelled || loadCtrl.signal.aborted) return;
        void fetch("/api/microsoft/colleagues?enrich=1")
          .then(async (res) => {
            const json = (await res.json()) as {
              colleagues?: Colleague[];
              hasChatCreateScope?: boolean;
              hasChatMessageSendScope?: boolean;
            };
            if (cancelled || !res.ok) return;
            if (json.colleagues?.length) setColleagues(json.colleagues);
            if (
              json.hasChatCreateScope === false ||
              json.hasChatMessageSendScope === false
            ) {
              setNeedsReconnect(true);
            }
          })
          .catch(() => {
            /* local list is enough to pick and send */
          });
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
      loadCtrl.abort();
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
        throw new Error(json.error || t("tickets.sendFailed"));
      }
      showActionFeedback({
        headline: t("tickets.colleagueInformed"),
        detail: json.created
          ? t("tickets.newTeamsChat")
          : t("tickets.existingChatSent"),
        tone: "success",
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tickets.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tickets.pingTitle")}</DialogTitle>
          <DialogDescription>
            {ticketLabel
              ? t("tickets.pingDescNamed", { id: issueId, label: ticketLabel })
              : t("tickets.pingDesc", { id: issueId })}
          </DialogDescription>
        </DialogHeader>

        {needsReconnect ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30">
            {t("tickets.reconnectLead")}{" "}
            <a href="/account" className="underline underline-offset-2">
              {t("common.account")}
            </a>{" "}
            {t("tickets.reconnectAfter")}{" "}
            <strong>{t("tickets.reconnectStrong")}</strong>.
          </p>
        ) : null}

        <label className="sr-only" htmlFor="ticket-ping-colleague-q">
          {t("tickets.searchColleague")}
        </label>
        <Input
          id="ticket-ping-colleague-q"
          name="colleague-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("tickets.nameOrEmail")}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
        />

        {loading && colleagues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2
              className="size-4 animate-spin"
              strokeWidth={APP_ICON_STROKE}
            />
            {t("tickets.loadingColleagues")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {colleagues.length === 0
              ? t("tickets.noColleaguesMs")
              : t("common.noResults")}
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
                        ? t("tickets.selfTestHelp")
                        : c.email || t("tickets.msConnected")}
                      {c.source === "chat" ? t("tickets.existingChat") : ""}
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
            {t("common.cancel")}
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
            {sending ? t("tickets.sending") : t("tickets.sendInTeams")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
