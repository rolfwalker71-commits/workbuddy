"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { EventBookingRef, EventMeetingKind } from "@/lib/mari/event-booking-ref";
import type { MariTimeBookFavorite } from "@/lib/mari/time-book-favorites";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";

export type EventBookingAttachTarget = {
  eventId: string;
  calendarId?: string | null;
  eventDate: string;
  startHm?: string | null;
  endHm?: string | null;
  title: string;
  attendeeEmails?: string[] | null;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
};

type CustomerHit = { cardCode: string; name: string };

export function EventBookingAttachDialog({
  open,
  onOpenChange,
  target,
  initial,
  meetingKind,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: EventBookingAttachTarget | null;
  initial?: EventBookingRef | null;
  meetingKind: EventMeetingKind;
  onSaved?: (booking: EventBookingRef) => void;
}) {
  const internal = meetingKind === "internal";
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerHit[]>([]);
  const [cardCode, setCardCode] = useState(initial?.cardCode || "");
  const [customerName, setCustomerName] = useState(initial?.customerName || "");
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectNumber, setProjectNumber] = useState(initial?.projectNumber || "");
  const [projectLabel, setProjectLabel] = useState(initial?.projectLabel || "");
  const [contracts, setContracts] = useState<MariKeyPair[]>([]);
  const [contractId, setContractId] = useState(
    initial?.contractId != null && initial.contractId > 0
      ? String(initial.contractId)
      : ""
  );
  const [favorites, setFavorites] = useState<MariTimeBookFavorite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCardCode(initial?.cardCode || "");
    setCustomerName(initial?.customerName || "");
    setProjectNumber(initial?.projectNumber || "");
    setProjectLabel(initial?.projectLabel || initial?.projectNumber || "");
    setContractId(
      initial?.contractId != null && initial.contractId > 0
        ? String(initial.contractId)
        : ""
    );
    setCustomerQuery("");
    setProjectQuery("");
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/maringo/timekeeping/favorites")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setFavorites((data.favorites || []) as MariTimeBookFavorite[]);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || internal) return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomers([]);
      return;
    }
    const t = window.setTimeout(() => {
      void fetch(`/api/maringo/customers?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => {
          setCustomers((data.customers || []) as CustomerHit[]);
        })
        .catch(() => setCustomers([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [customerQuery, open, internal]);

  useEffect(() => {
    if (!open) return;
    const q = projectQuery.trim();
    if (!projectOpen && !q) return;
    const t = window.setTimeout(() => {
      void fetch(
        `/api/maringo/timekeeping/projects?q=${encodeURIComponent(q)}`
      )
        .then((r) => r.json())
        .then((data) => {
          setProjects((data.projects || []) as MariKeyPair[]);
        })
        .catch(() => setProjects([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [projectQuery, projectOpen, open]);

  useEffect(() => {
    if (!open || !projectNumber) {
      setContracts([]);
      return;
    }
    let cancelled = false;
    void fetch(
      `/api/maringo/timekeeping/projects/${encodeURIComponent(projectNumber)}/contracts?activeOnly=0`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setContracts((data.contracts || []) as MariKeyPair[]);
      })
      .catch(() => {
        if (!cancelled) setContracts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectNumber]);

  function applyFavorite(fav: MariTimeBookFavorite) {
    setProjectNumber(fav.projectNumber);
    setProjectLabel(fav.projectLabel || fav.projectNumber);
    setContractId(
      fav.contractId != null && fav.contractId > 0 ? String(fav.contractId) : ""
    );
    setProjectOpen(false);
    setError(null);
  }

  function selectProject(p: MariKeyPair) {
    setProjectNumber(p.keyInternal);
    setProjectLabel(formatMariProjectLabel(p.keyInternal, p.matchcode));
    setContractId("");
    setProjectOpen(false);
  }

  async function save() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const cid = contractId ? Number(contractId) : internal ? 0 : null;
      const res = await fetch("/api/maringo/event-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: target.eventId,
          seriesMasterId: target.seriesMasterId ?? null,
          iCalUId: target.iCalUId ?? null,
          calendarId: target.calendarId ?? null,
          eventDate: target.eventDate,
          startHm: target.startHm ?? null,
          endHm: target.endHm ?? null,
          title: target.title,
          attendeeEmails: target.attendeeEmails || [],
          cardCode: cardCode || null,
          customerName: customerName || null,
          projectNumber: projectNumber || null,
          projectLabel: projectLabel || projectNumber || null,
          contractId: cid,
          contractVisible: null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      onSaved?.(data.booking as EventBookingRef);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {internal ? "Internes Projekt merken" : "Kunde / Projekt / Vertrag"}
          </DialogTitle>
          <DialogDescription>
            {internal
              ? "Für spätere Stundenbuchung: internes Projekt, in der Regel ohne Vertrag. Bei Serie gilt das für alle Folgetermine."
              : "Für spätere Stundenbuchung merken. Bei Serie gilt das für alle Folgetermine."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-950 ring-1 ring-rose-200 dark:bg-rose-500/12 dark:text-rose-100 dark:ring-rose-400/30">
              {error}
            </p>
          ) : null}

          {favorites.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                <Star className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                Favoriten
              </div>
              <div className="flex flex-wrap gap-1.5">
                {favorites.map((fav) => (
                  <Button
                    key={fav.id}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-auto max-w-full whitespace-normal rounded-full px-3 py-1.5 text-left text-xs font-medium leading-snug"
                    onClick={() => applyFavorite(fav)}
                  >
                    {fav.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {!internal ? (
            <div className="space-y-1">
              <Label htmlFor="eb-kunde">Kunde</Label>
              <Input
                id="eb-kunde"
                value={customerQuery || customerName}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setCustomerName(e.target.value);
                }}
                placeholder="Kunde suchen (Name oder CardCode)"
                autoComplete="off"
              />
              {customers.length > 0 ? (
                <ul className="max-h-40 overflow-auto rounded-lg border border-border bg-background shadow-sm">
                  {customers.slice(0, 8).map((c) => (
                    <li key={c.cardCode}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-between px-2.5 py-1.5 text-left text-xs font-normal"
                        onClick={() => {
                          setCardCode(c.cardCode);
                          setCustomerName(c.name);
                          setCustomerQuery("");
                          setCustomers([]);
                          setProjectQuery(c.name);
                          setProjectOpen(true);
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.cardCode}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="eb-project">Projekt</Label>
            <Input
              id="eb-project"
              value={projectOpen ? projectQuery : projectLabel || projectQuery}
              onChange={(e) => {
                setProjectQuery(e.target.value);
                setProjectOpen(true);
              }}
              onFocus={() => {
                setProjectOpen(true);
                setProjectQuery("");
              }}
              placeholder={
                internal ? "Internes Projekt oder Favorit" : "Suche z.B. Werk oder P200000"
              }
              autoComplete="off"
            />
            {projectOpen ? (
              <ul className="max-h-40 overflow-auto rounded-lg border border-border bg-background shadow-sm">
                {projects.length === 0 ? (
                  <li className="px-2.5 py-2 text-xs text-muted-foreground">
                    Keine Treffer
                  </li>
                ) : (
                  projects.slice(0, 40).map((p) => (
                    <li key={`${p.keyInternal}-${p.matchcode}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full flex-col items-start px-2.5 py-1.5 text-left text-xs font-normal"
                        onClick={() => selectProject(p)}
                      >
                        <span className="font-medium">{p.matchcode}</span>
                        <span className="text-muted-foreground">
                          {p.keyVisible || p.keyInternal}
                        </span>
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          <MariKeyPairPicker
            id="eb-contract"
            label="Vertrag"
            value={contractId}
            options={contracts}
            placeholder="Vertrag wählen…"
            emptyLabel="Kein Vertrag nötig"
            disabled={!projectNumber}
            onChange={setContractId}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
