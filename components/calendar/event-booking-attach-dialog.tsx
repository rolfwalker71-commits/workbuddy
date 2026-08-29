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
import { useT } from "@/components/i18n/locale-provider";
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

type CustomerProjectHit = {
  cardCode: string;
  name: string;
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
};

function customerFieldLabel(name: string, code: string): string {
  const n = name.trim();
  const c = code.trim();
  if (n && c && n !== c) return `${n} · ${c}`;
  return n || c;
}

function suggestionToKeyPair(s: CustomerProjectHit): MariKeyPair | null {
  const pn = (s.projectNumber || "").trim();
  if (!pn) return null;
  return {
    keyInternal: pn,
    keyVisible: pn,
    matchcode: (s.projectLabel || s.name || pn).trim(),
    indent: 0,
    indentParent: false,
  };
}

function mergeProjectLists(
  preferred: MariKeyPair[],
  extra: MariKeyPair[]
): MariKeyPair[] {
  const seen = new Set<string>();
  const out: MariKeyPair[] = [];
  for (const p of [...preferred, ...extra]) {
    const key = p.keyInternal || p.keyVisible;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

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
  const t = useT();
  const internal = meetingKind === "internal";
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customers, setCustomers] = useState<CustomerHit[]>([]);
  const [cardCode, setCardCode] = useState(() => (initial?.cardCode || "").trim());
  const [customerName, setCustomerName] = useState(
    () => (initial?.customerName || "").trim()
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectNumber, setProjectNumber] = useState(
    () => (initial?.projectNumber || "").trim()
  );
  const [projectLabel, setProjectLabel] = useState(() =>
    (initial?.projectLabel || initial?.projectNumber || "").trim()
  );
  const [contracts, setContracts] = useState<MariKeyPair[]>([]);
  const [contractId, setContractId] = useState(() =>
    initial?.contractId != null && initial.contractId > 0
      ? String(initial.contractId)
      : ""
  );
  const [contractVisible, setContractVisible] = useState(() =>
    (
      initial?.contractVisible ||
      (initial?.contractId != null && initial.contractId > 0
        ? String(initial.contractId)
        : "")
    ).trim()
  );
  const [favorites, setFavorites] = useState<MariTimeBookFavorite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = customerFieldLabel(customerName, cardCode);
  const selectedProject =
    projectLabel ||
    formatMariProjectLabel(projectNumber, projectLabel || null);

  useEffect(() => {
    if (!open) return;
    const nextCode = (initial?.cardCode || "").trim();
    const nextName = (initial?.customerName || "").trim();
    const nextPn = (initial?.projectNumber || "").trim();
    const nextPl = (initial?.projectLabel || nextPn).trim();
    const nextCid =
      initial?.contractId != null && initial.contractId > 0
        ? String(initial.contractId)
        : "";
    const nextCv = (initial?.contractVisible || "").trim();
    setCardCode(nextCode);
    setCustomerName(nextName);
    setProjectNumber(nextPn);
    setProjectLabel(nextPl || nextPn);
    setContractId(nextCid);
    setContractVisible(nextCv || nextCid);
    setCustomerQuery("");
    setCustomerSearching(false);
    setCustomers([]);
    setProjectQuery("");
    setProjectOpen(false);
    setError(null);
  }, [
    open,
    initial?.cardCode,
    initial?.customerName,
    initial?.projectNumber,
    initial?.projectLabel,
    initial?.contractId,
    initial?.contractVisible,
  ]);

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
    if (!open || !customerSearching) return;
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
  }, [customerQuery, customerSearching, open]);

  useEffect(() => {
    if (!open) return;
    const q = projectQuery.trim();
    if (!projectOpen && !q) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          if (cardCode && !q) {
            const [custRes, tkRes] = await Promise.all([
              fetch(
                `/api/maringo/customers?cardCode=${encodeURIComponent(cardCode)}`
              ),
              fetch("/api/maringo/timekeeping/projects"),
            ]);
            const custData = await custRes.json().catch(() => ({}));
            const tkData = await tkRes.json().catch(() => ({}));
            const suggestions = (custData.suggestions ||
              []) as CustomerProjectHit[];
            const allowed = new Set(
              suggestions
                .map((s) => (s.projectNumber || "").trim())
                .filter(Boolean)
            );
            if (projectNumber) allowed.add(projectNumber);
            const fromCustomer = suggestions
              .map(suggestionToKeyPair)
              .filter((p): p is MariKeyPair => p != null);
            const fromTk = ((tkData.projects || []) as MariKeyPair[]).filter(
              (p) => allowed.has(p.keyInternal) || allowed.has(p.keyVisible)
            );
            const merged = mergeProjectLists(fromTk, fromCustomer);
            if (
              projectNumber &&
              !merged.some(
                (p) =>
                  p.keyInternal === projectNumber ||
                  p.keyVisible === projectNumber
              )
            ) {
              merged.unshift({
                keyInternal: projectNumber,
                keyVisible: projectNumber,
                matchcode: projectLabel || projectNumber,
                indent: 0,
                indentParent: false,
              });
            }
            setProjects(merged);
            return;
          }
          const res = await fetch(
            `/api/maringo/timekeeping/projects?q=${encodeURIComponent(q)}`
          );
          const data = await res.json().catch(() => ({}));
          setProjects((data.projects || []) as MariKeyPair[]);
        } catch {
          setProjects([]);
        }
      })();
    }, 220);
    return () => window.clearTimeout(t);
  }, [projectQuery, projectOpen, open, cardCode, projectNumber, projectLabel]);

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
    setContractVisible(
      fav.contractId != null && fav.contractId > 0 ? String(fav.contractId) : ""
    );
    setProjectOpen(false);
    setProjectQuery("");
    setError(null);
  }

  function selectCustomer(c: CustomerHit) {
    const same = c.cardCode === cardCode;
    setCardCode(c.cardCode);
    setCustomerName(c.name);
    setCustomerQuery("");
    setCustomerSearching(false);
    setCustomers([]);
    if (!same) {
      setProjectNumber("");
      setProjectLabel("");
      setProjectQuery("");
      setContractId("");
      setContractVisible("");
      setContracts([]);
    }
    setProjectOpen(true);
    setError(null);
  }

  function selectProject(p: MariKeyPair) {
    setProjectNumber(p.keyInternal);
    setProjectLabel(formatMariProjectLabel(p.keyInternal, p.matchcode));
    setContractId("");
    setContractVisible("");
    setProjectQuery("");
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
          contractVisible: contractVisible || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("common.saveFailed"));
      onSaved?.(data.booking as EventBookingRef);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const hasCustomer = Boolean(
    cardCode ||
      customerName ||
      initial?.cardCode ||
      initial?.customerName
  );
  const title =
    internal && !hasCustomer
      ? t("calendarUi.rememberInternal")
      : t("calendarUi.customerProjectContract");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,42rem)] min-h-[min(70vh,36rem)] w-full flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {internal && !hasCustomer
              ? t("calendarUi.bookingInternalHint")
              : t("calendarUi.bookingHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {error ? (
            <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-950 ring-1 ring-rose-200 dark:bg-rose-500/12 dark:text-rose-100 dark:ring-rose-400/30">
              {error}
            </p>
          ) : null}

          {favorites.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                <Star className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                {t("common.favorites")}
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

          <div className="space-y-1">
            <Label htmlFor="eb-kunde">{t("workspace.customer")}</Label>
            <Input
              id="eb-kunde"
              value={customerSearching ? customerQuery : selectedCustomer}
              onChange={(e) => {
                setCustomerSearching(true);
                setCustomerQuery(e.target.value);
                if (!e.target.value.trim()) {
                  setCardCode("");
                  setCustomerName("");
                }
              }}
              onFocus={() => {
                setCustomerSearching(true);
                if (!customerQuery) setCustomerQuery(selectedCustomer);
              }}
              placeholder={t("calendarUi.searchCustomer")}
              autoComplete="off"
            />
            {customerSearching && customers.length > 0 ? (
              <ul className="max-h-48 overflow-auto rounded-lg border border-border bg-background shadow-sm">
                {customers.slice(0, 40).map((c) => (
                  <li key={c.cardCode}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-between px-2.5 py-1.5 text-left text-xs font-normal"
                      onClick={() => selectCustomer(c)}
                    >
                      <span className="min-w-0 break-words font-medium leading-snug">
                        {c.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {c.cardCode}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="eb-project">{t("common.project")}</Label>
            <Input
              id="eb-project"
              value={
                projectOpen && projectQuery
                  ? projectQuery
                  : selectedProject || projectQuery
              }
              onChange={(e) => {
                setProjectQuery(e.target.value);
                setProjectOpen(true);
              }}
              onFocus={() => {
                setProjectOpen(true);
              }}
              placeholder={
                internal && !hasCustomer
                  ? t("calendarUi.internalProjectOrFav")
                  : t("calendarUi.searchProject")
              }
              autoComplete="off"
            />
            {projectOpen ? (
              <ul className="max-h-48 overflow-auto rounded-lg border border-border bg-background shadow-sm">
                {projects.length === 0 ? (
                  <li className="px-2.5 py-2 text-xs text-muted-foreground">
                    {cardCode && !projectQuery.trim()
                      ? t("calendarUi.noProjectsForCustomer")
                      : t("common.noResults")}
                  </li>
                ) : (
                  projects.slice(0, 80).map((p) => (
                    <li key={`${p.keyInternal}-${p.matchcode}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full flex-col items-start px-2.5 py-1.5 text-left text-xs font-normal"
                        onClick={() => selectProject(p)}
                      >
                        <span className="font-medium leading-snug break-words">
                          {p.matchcode}
                        </span>
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
            label={t("timekeeping.contract")}
            value={contractId}
            valueLabel={contractVisible || contractId || null}
            options={contracts}
            placeholder={t("calendarUi.chooseContract")}
            emptyLabel={t("calendarUi.noContractNeeded")}
            disabled={!projectNumber}
            onChange={(next) => {
              setContractId(next);
              const row = contracts.find((o) => o.keyInternal === next);
              setContractVisible(row?.keyVisible || next);
            }}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
