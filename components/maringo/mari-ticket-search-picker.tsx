"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export type MariTicketPick = {
  issueId: number;
  briefDescription: string;
};

function asTicketHit(raw: unknown): MariTicketPick | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const issueId = Number(obj.issueId);
  if (!Number.isInteger(issueId) || issueId <= 0) return null;
  const brief =
    typeof obj.briefDescription === "string" ? obj.briefDescription.trim() : "";
  return { issueId, briefDescription: brief };
}

function filterTickets(tickets: MariTicketPick[], query: string): MariTicketPick[] {
  const q = query.replace(/^#/, "").trim().toLowerCase();
  if (!q) return tickets.slice(0, 8);
  return tickets
    .filter(
      (t) =>
        String(t.issueId).includes(q) ||
        t.briefDescription.toLowerCase().includes(q)
    )
    .slice(0, 8);
}

export function MariTicketSearchPicker({
  value,
  onChange,
  disabled,
  id = "mari-ticket-search",
}: {
  value: MariTicketPick | null;
  onChange: (next: MariTicketPick | null) => void;
  disabled?: boolean;
  id?: string;
}) {
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<MariTicketPick[]>([]);
  const [hits, setHits] = useState<MariTicketPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void fetch("/api/maringo/tickets")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 503) {
          setError("Maringo nicht verbunden.");
          setTickets([]);
          return;
        }
        if (!res.ok) {
          setError(
            typeof json.error === "string"
              ? json.error
              : "Tickets laden fehlgeschlagen."
          );
          setTickets([]);
          return;
        }
        const list = Array.isArray(json.tickets) ? json.tickets : [];
        setTickets(
          list
            .map(asTicketHit)
            .filter((t): t is MariTicketPick => t != null)
        );
        setError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Tickets laden fehlgeschlagen.");
          setTickets([]);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    setHits(filterTickets(tickets, q));
    const idMatch = /^#?(\d{2,})$/.exec(q);
    if (!idMatch) return;
    const issueId = Number(idMatch[1]);
    if (tickets.some((t) => t.issueId === issueId)) return;
    const t = window.setTimeout(() => {
      void fetch(`/api/maringo/tickets/${issueId}`)
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) return;
          const hit = asTicketHit(json.ticket);
          if (hit) {
            setHits((prev) =>
              prev.some((x) => x.issueId === hit.issueId)
                ? prev
                : [hit, ...prev].slice(0, 8)
            );
          }
        })
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, tickets]);

  const showList = open && !value && (hits.length > 0 || Boolean(query.trim()));

  const hint = useMemo(() => {
    if (error) return error;
    if (busy) return "Suche…";
    return null;
  }, [busy, error]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Ticket zuordnen (optional)</Label>
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
            Ticket #{value.issueId}
            {value.briefDescription ? (
              <span className="min-w-0 truncate font-normal text-primary/80">
                · {value.briefDescription}
              </span>
            ) : null}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            Lösen
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id={id}
            value={query}
            disabled={disabled}
            placeholder="Ticket suchen…"
            autoComplete="off"
            spellCheck={false}
            className="pr-8"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
          <Search
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={APP_ICON_STROKE}
            aria-hidden
          />
          {showList ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border/70 bg-background py-1 shadow-md">
              {hits.length === 0 ? (
                <li className="px-2.5 py-2 text-xs text-muted-foreground">
                  Kein Treffer in der Liste. Ticket-Nummer eingeben oder in
                  Maringo anlegen.
                </li>
              ) : (
                hits.map((hit) => (
                  <li key={hit.issueId}>
                    <button
                      type="button"
                      className="flex w-full min-h-11 items-start px-2.5 py-2 text-left text-sm leading-snug hover:bg-muted"
                      onClick={() => {
                        onChange(hit);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="font-medium">#{hit.issueId}</span>
                        {hit.briefDescription ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {hit.briefDescription}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Neues Ticket in Maringo anlegen, dann hier zuordnen.
      </p>
    </div>
  );
}
