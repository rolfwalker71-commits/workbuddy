"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Clock3, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { MaringoLogo } from "@/components/branding/provider-logos";
import { cn } from "@/lib/utils";
import type { MariTicketListItem } from "@/lib/mari/tickets";
import type { MariCustomerOption } from "@/lib/mari/customers";
import type { MariCalendarStamp } from "@/lib/mari/calendar-stamp";
import { STATUS_LABELS } from "@/lib/mari/status";

export type AkteFilterCustomer = MariCustomerOption & {
  ticketCount: number;
};

type Workspace = {
  cardCode: string;
  name: string;
  tickets: MariTicketListItem[];
  openCount: number;
  hoursTotal: number;
  hoursThisWeek: number;
  lastLines: Array<{
    issueId: number;
    serviceDate: string;
    hours: number;
    activity: string;
  }>;
  upcomingStamps: MariCalendarStamp[];
};

const customerCardClass =
  "flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-3.5 py-3 text-left shadow-sm ring-1 ring-foreground/10 transition-shadow hover:bg-muted hover:shadow-md";

export function CustomerWorkspacePanel({
  cardCode,
  filterCustomers,
  ticketsLoading,
  onOpenTicket,
  onBook,
  onAdhoc,
  onPickCustomer,
}: {
  cardCode: string | null;
  filterCustomers: AkteFilterCustomer[];
  ticketsLoading: boolean;
  onOpenTicket: (issueId: number) => void;
  onBook: (ticket: MariTicketListItem) => void;
  onAdhoc: (ticket: MariTicketListItem | null) => void;
  onPickCustomer: (
    customer: MariCustomerOption,
    source: "filter" | "search"
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MariCustomerOption[]>([]);
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardCode) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(
      `/api/maringo/customer-workspace?cardCode=${encodeURIComponent(cardCode)}`
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Akte laden fehlgeschlagen");
        if (!cancelled) setData(json as Workspace);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardCode]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void fetch(`/api/maringo/customers?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((json) => setHits(json.customers || []))
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const firstOpen = data?.tickets.find((t) => t.status !== 2 && t.status !== 5) ||
    data?.tickets[0] ||
    null;
  const selectedInFilter = Boolean(
    cardCode && filterCustomers.some((c) => c.cardCode === cardCode)
  );
  const showFilterList =
    filterCustomers.length >= 2 ||
    (filterCustomers.length === 1 && !selectedInFilter);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="akte-search" className="sr-only">
          Kunde suchen
        </label>
        <Input
          id="akte-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kunde suchen (Name oder CardCode)"
        />
        {hits.length > 0 ? (
          <ul className="space-y-2">
            {hits.slice(0, 8).map((c) => (
              <li key={c.cardCode}>
                <button
                  type="button"
                  className={customerCardClass}
                  onClick={() => {
                    onPickCustomer(c, "search");
                    setQuery("");
                    setHits([]);
                  }}
                >
                  <span className="min-w-0 font-semibold wrap-break-word">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.cardCode}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {ticketsLoading && filterCustomers.length === 0 && !cardCode ? (
        <p className="text-sm text-muted-foreground">
          Lade Kunden aus dem Ticketfilter…
        </p>
      ) : filterCustomers.length === 0 && !cardCode ? (
        <div className="rounded-2xl bg-card px-4 py-8 text-center shadow-sm ring-1 ring-foreground/10">
          <p className="text-sm font-semibold">Keine Akten im Filter</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Im aktuellen Ticketfilter gibt es keine Tickets mit Kundenakte.
            Filter auf Tickets anpassen oder einen Kunden suchen.
          </p>
        </div>
      ) : null}

      {filterCustomers.length === 0 && cardCode ? (
        <p className="text-sm text-muted-foreground">
          Keine Kunden im aktuellen Ticketfilter — gewählte Akte bleibt offen.
        </p>
      ) : filterCustomers.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          1 Kunde mit Tickets im aktuellen Filter
        </p>
      ) : null}

      {showFilterList ? (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-bold">Kunden im Ticketfilter</h3>
            <p className="text-xs text-muted-foreground">
              {filterCustomers.length}{" "}
              {filterCustomers.length === 1 ? "Kunde" : "Kunden"} mit Tickets
              im aktuellen Filter
            </p>
          </div>
          <ul className="max-h-[min(16rem,40vh)] space-y-2 overflow-y-auto">
            {filterCustomers.map((c) => {
              const selected = c.cardCode === cardCode;
              return (
                <li key={c.cardCode}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      customerCardClass,
                      selected && "bg-muted ring-2 ring-primary"
                    )}
                    onClick={() => onPickCustomer(c, "filter")}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold wrap-break-word">
                        {c.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.cardCode}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {c.ticketCount}{" "}
                      {c.ticketCount === 1 ? "Ticket" : "Tickets"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!cardCode && !ticketsLoading && filterCustomers.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Kunde wählen, um Tickets, Stunden und Termine in einer Akte zu sehen.
        </p>
      ) : !cardCode ? null : loading ? (
        <p className="text-sm text-muted-foreground">Lade Akte…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : data ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10">
            <div className="flex items-start gap-2">
              <MaringoLogo className="size-6" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <FolderOpen className="size-4" strokeWidth={APP_ICON_STROKE} />
                  Kundenakte {data.name}
                </p>
                <p className="text-xs text-muted-foreground">{data.cardCode}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/40 px-2 py-2">
                <dt className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                  Offen
                </dt>
                <dd className="text-lg font-black tabular-nums">{data.openCount}</dd>
              </div>
              <div className="rounded-xl bg-muted/40 px-2 py-2">
                <dt className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                  Diese Woche
                </dt>
                <dd className="text-lg font-black tabular-nums">
                  {data.hoursThisWeek.toFixed(2)} h
                </dd>
              </div>
              <div className="rounded-xl bg-muted/40 px-2 py-2">
                <dt className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                  Gesamt
                </dt>
                <dd className="text-lg font-black tabular-nums">
                  {data.hoursTotal.toFixed(2)} h
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onAdhoc(firstOpen)}
              >
                <CalendarPlus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                Termin
              </Button>
              {firstOpen ? (
                <Button type="button" size="sm" onClick={() => onBook(firstOpen)}>
                  <Clock3 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  Buchen
                </Button>
              ) : null}
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold">Offene Tickets</h3>
            {data.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Tickets.</p>
            ) : (
              <ul className="space-y-2">
                {data.tickets.slice(0, 20).map((t) => (
                  <li key={t.issueId}>
                    <button
                      type="button"
                      onClick={() => onOpenTicket(t.issueId)}
                      className={customerCardClass}
                    >
                      <span className="min-w-0 font-semibold wrap-break-word">
                        #{t.issueId} {t.briefDescription}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t.statusName || STATUS_LABELS[t.status] || t.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.upcomingStamps.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-bold">Nächste Termine</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {data.upcomingStamps.map((s) => (
                  <li key={`${s.eventId}-${s.issueId}`}>
                    {s.eventDate}
                    {s.startHm ? ` ${s.startHm}` : ""} · #{s.issueId} {s.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
