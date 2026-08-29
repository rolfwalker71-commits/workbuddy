"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";
import { TIMEKEEPING_INT_BEMERKUNG_OPTIONS } from "@/lib/mari/timekeeping-udfs";
import type { MariTimeBookFavorite } from "@/lib/mari/time-book-favorites";
import { isAllowedCompanyEmail } from "@/lib/auth/allowed-email";
import {
  partnerSuggestionChipLabel,
  partnerSuggestionChipReason,
  type MariEmailPartnerSuggestion,
} from "@/lib/mari/customers-shared";
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";

export type TimeBookFormDefaults = {
  dayOfService?: string;
  projectNumber?: string | null;
  projectLabel?: string | null;
  contractId?: number | null;
  contractPositionId?: number | null;
  /** Sichtbare Vertragsnummer (z.B. V60011100) — wird nachgeladen. */
  contractVisible?: string | null;
  activity?: string;
  memoText?: string;
  hours?: number;
  hoursBillable?: number;
  billable?: boolean;
  issueId?: number | null;
  internalRemarkVerr?: string | null;
  zeroHoursReason?: string | null;
  /** Internal meetings: Vertrag typically not required. */
  contractOptional?: boolean;
};

export type TimeBookFormValues = {
  dayOfService: string;
  projectNumber: string;
  projectLabel: string;
  contractId: number;
  contractPositionId: number | null;
  activity: string;
  memoText: string;
  hours: number;
  hoursBillable: number;
  issueId?: number | null;
  internalRemarkVerr: string | null;
  zeroHoursReason: string | null;
};

function zurichTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseHours(raw: string): number | null {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

function nonBillableFrom(hours: number, hoursBillable: number): number {
  return Math.max(0, roundHours(hours - hoursBillable));
}

function sumHours(hoursBillable: number, nonBillable: number): number {
  return roundHours(hoursBillable + nonBillable);
}

export function MaringoTimeBookForm({
  defaults,
  submitLabel = "Buchen",
  onSubmit,
  className,
  layout = "compact",
  enableFavorites = true,
  attendeeEmails,
  subjectSuggestions,
  initialHint,
  preserveEventPrefillOnChips = false,
  hoursHint,
}: {
  defaults?: TimeBookFormDefaults | null;
  submitLabel?: string;
  onSubmit: (values: TimeBookFormValues) => Promise<void>;
  className?: string;
  /** wide = volle Breite untereinander (Stunden-Tab); compact = Dialog */
  layout?: "wide" | "compact";
  enableFavorites?: boolean;
  /** Teilnehmer-Adressen — Kundenvorschläge als Chips, nie Autobuchen. */
  attendeeEmails?: string[] | null;
  /** Betreff C/P/V/Name — Chips, nie Autobuchen. */
  subjectSuggestions?: MariEmailPartnerSuggestion[] | null;
  /** Hinweis nach Betreff-Prefill. */
  initialHint?: string | null;
  /** Favorit/Chip ändert Projekt, nicht Stunden/Memo aus dem Termin. */
  preserveEventPrefillOnChips?: boolean;
  /** Hinweis unter den Stundenfeldern (z.B. Vorlage aus Termindauer). */
  hoursHint?: string | null;
}) {
  const [dayOfService, setDayOfService] = useState(
    defaults?.dayOfService || zurichTodayYmd()
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectNumber, setProjectNumber] = useState(
    defaults?.projectNumber || ""
  );
  const [projectLabel, setProjectLabel] = useState(
    defaults?.projectLabel || defaults?.projectNumber || ""
  );
  const [contracts, setContracts] = useState<MariKeyPair[]>([]);
  const [contractId, setContractId] = useState(
    defaults?.contractId != null ? String(defaults.contractId) : ""
  );
  const [positions, setPositions] = useState<MariKeyPair[]>([]);
  const [contractPositionId, setContractPositionId] = useState(
    defaults?.contractPositionId != null
      ? String(defaults.contractPositionId)
      : ""
  );
  const [activity, setActivity] = useState(defaults?.activity || "");
  const [memoText, setMemoText] = useState(defaults?.memoText || "");
  const [internalRemarkVerr, setInternalRemarkVerr] = useState(
    defaults?.internalRemarkVerr || ""
  );
  const [zeroHoursReason, setZeroHoursReason] = useState(
    defaults?.zeroHoursReason || ""
  );
  const initialHours = defaults?.hours ?? 0.25;
  const initialBillableH =
    defaults?.hoursBillable ??
    (defaults?.billable === false ? 0 : initialHours);
  const initialNonBillable = nonBillableFrom(initialHours, initialBillableH);
  const [hoursBillableRaw, setHoursBillableRaw] = useState(
    String(initialBillableH)
  );
  const [nonBillableRaw, setNonBillableRaw] = useState(
    String(initialNonBillable)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(initialHint ?? null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [favorites, setFavorites] = useState<MariTimeBookFavorite[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [favoriteName, setFavoriteName] = useState("");
  const [contractVisible] = useState(
    (defaults?.contractVisible || "").trim()
  );
  const [attendeeHits, setAttendeeHits] = useState<
    MariEmailPartnerSuggestion[]
  >([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const partnerHits = useMemo(() => {
    const seen = new Set<string>();
    const out: MariEmailPartnerSuggestion[] = [];
    for (const row of [...(subjectSuggestions || []), ...attendeeHits]) {
      const key = `${row.cardCode}::${row.projectNumber || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }, [subjectSuggestions, attendeeHits]);
  const externalAttendeeEmails = useMemo(
    () =>
      (attendeeEmails || [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@") && !isAllowedCompanyEmail(e))
        .slice(0, 5),
    [attendeeEmails]
  );
  const showCustomerChips =
    externalAttendeeEmails.length > 0 ||
    Boolean(subjectSuggestions && subjectSuggestions.length > 0) ||
    partnersLoading;

  const loadFavorites = useCallback(async () => {
    if (!enableFavorites) return;
    setFavoritesLoading(true);
    try {
      const res = await fetch("/api/maringo/timekeeping/favorites");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Favoriten laden fehlgeschlagen");
      setFavorites((data.favorites || []) as MariTimeBookFavorite[]);
    } catch {
      /* Favoriten optional — Maske bleibt nutzbar */
    } finally {
      setFavoritesLoading(false);
    }
  }, [enableFavorites]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    const emails = externalAttendeeEmails;
    if (emails.length === 0) {
      setAttendeeHits([]);
      setPartnersLoading(false);
      return;
    }
    let cancelled = false;
    setPartnersLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/maringo/customers?emails=${encodeURIComponent(emails.join(","))}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Teilnehmer-Suche fehlgeschlagen");
        const next = (data.suggestions || []) as MariEmailPartnerSuggestion[];
        setAttendeeHits(next);
      } catch {
        if (!cancelled) setAttendeeHits([]);
      } finally {
        if (!cancelled) setPartnersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalAttendeeEmails]);

  const loadProjects = useCallback(async (q: string) => {
    setLoadingProjects(true);
    try {
      const res = await fetch(
        `/api/maringo/timekeeping/projects?q=${encodeURIComponent(q)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Projekte laden fehlgeschlagen");
      setProjects((data.projects || []) as MariKeyPair[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadProjects(projectQuery);
    }, 250);
    return () => window.clearTimeout(t);
  }, [projectQuery, loadProjects]);

  useEffect(() => {
    if (!projectNumber) {
      setContracts([]);
      setPositions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const coRes = await fetch(
          `/api/maringo/timekeeping/projects/${encodeURIComponent(projectNumber)}/contracts`
        );
        const co = await coRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!coRes.ok) throw new Error(co.error || "Verträge laden fehlgeschlagen");
        const nextContracts = (co.contracts || []) as MariKeyPair[];
        setContracts(nextContracts);
        const visible = contractVisible.toUpperCase();
        const byVisible = visible
          ? nextContracts.find(
              (c) =>
                c.keyVisible.toUpperCase() === visible ||
                c.matchcode.toUpperCase() === visible
            )
          : undefined;
        if (contractId && nextContracts.some((c) => c.keyInternal === contractId)) {
          // keep preset
        } else if (byVisible) {
          setContractId(byVisible.keyInternal);
        } else if (!contractId && nextContracts.length === 1) {
          setContractId(nextContracts[0]!.keyInternal);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when project changes
  }, [projectNumber]);

  useEffect(() => {
    if (!contractId || Number(contractId) <= 0) {
      setPositions([]);
      setContractPositionId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/maringo/timekeeping/contracts/${encodeURIComponent(contractId)}/positions`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Positionen laden fehlgeschlagen");
        const next = (data.positions || []) as MariKeyPair[];
        setPositions(next);
        if (
          contractPositionId &&
          !next.some((p) => p.keyInternal === contractPositionId)
        ) {
          // keep
        } else if (!contractPositionId && next.length === 1) {
          setContractPositionId(next[0]!.keyInternal);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  function selectProject(p: MariKeyPair) {
    const pn = p.keyVisible || p.keyInternal;
    setProjectNumber(p.keyInternal || p.keyVisible);
    setProjectLabel(formatMariProjectLabel(pn, p.matchcode));
    setProjectOpen(false);
    setContractId("");
    setContractPositionId("");
  }

  function hoursFromSplit(): number {
    return sumHours(
      parseHours(hoursBillableRaw) ?? 0,
      parseHours(nonBillableRaw) ?? 0
    );
  }

  function applyFavorite(fav: MariTimeBookFavorite) {
    setError(null);
    setHint(
      preserveEventPrefillOnChips
        ? `Favorit «${fav.name}» geladen — Stunden und Memo bleiben die Vorlage aus dem Termin.`
        : `Favorit «${fav.name}» geladen — Datum und Stunden prüfen, dann buchen.`
    );
    setProjectNumber(fav.projectNumber);
    setProjectLabel(fav.projectLabel || fav.projectNumber);
    setContractId(fav.contractId != null ? String(fav.contractId) : "");
    setContractPositionId(
      fav.contractPositionId != null ? String(fav.contractPositionId) : ""
    );
    setActivity(fav.activity);
    if (!preserveEventPrefillOnChips) {
      setMemoText(fav.memoText || "");
      const h = fav.hours;
      const hb = fav.hoursBillable ?? (fav.billable ? fav.hours : 0);
      setHoursBillableRaw(String(hb));
      setNonBillableRaw(String(nonBillableFrom(h, hb)));
    }
    setProjectOpen(false);
  }

  function applyPartnerChip(s: MariEmailPartnerSuggestion) {
    setError(null);
    const fromAttendee = Boolean(s.matchedEmail) || s.source !== "title";
    if (!s.projectNumber) {
      setHint(
        fromAttendee
          ? `Kunde «${s.name}» — Ansprechpartner im Termin. Projekt wählen.`
          : `Kunde «${s.name}» aus dem Betreff — Projekt wählen.`
      );
      setProjectQuery(s.name);
      setProjectOpen(true);
      return;
    }
    setHint(
      fromAttendee
        ? `Vorschlag «${s.name}» — Ansprechpartner im Termin. Projekt prüfen, dann buchen. Stunden und Memo bleiben die Vorlage.`
        : `Vorschlag «${s.name}» — Projekt prüfen, dann buchen. Stunden und Memo bleiben die Vorlage.`
    );
    setProjectNumber(s.projectNumber);
    setProjectLabel(
      formatMariProjectLabel(s.projectNumber, s.projectLabel || s.name)
    );
    setContractId(s.contractId != null && s.contractId > 0 ? String(s.contractId) : "");
    setContractPositionId("");
    setProjectOpen(false);
  }

  function favoritePayloadFromForm(name: string) {
    const hoursBillable = Math.max(0, parseHours(hoursBillableRaw) ?? 0);
    const nonBillable = Math.max(0, parseHours(nonBillableRaw) ?? 0);
    const hours = sumHours(hoursBillable, nonBillable);
    return {
      name: name.trim(),
      projectNumber,
      projectLabel: projectLabel || projectNumber,
      contractId: contractId ? Number(contractId) : null,
      contractPositionId: contractPositionId
        ? Number(contractPositionId)
        : null,
      activity: activity.trim(),
      memoText: memoText.trim() || null,
      hours,
      hoursBillable,
      billable: hoursBillable > 0,
    };
  }

  async function persistFavorite(name: string) {
    const res = await fetch("/api/maringo/timekeeping/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(favoritePayloadFromForm(name)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Favorit speichern fehlgeschlagen");
    await loadFavorites();
    return data.favorite as MariTimeBookFavorite | undefined;
  }

  async function deleteFavorite(id: number) {
    setError(null);
    const res = await fetch(`/api/maringo/timekeeping/favorites/${id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Favorit löschen fehlgeschlagen");
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHint(null);
    const hoursBillable = parseHours(hoursBillableRaw);
    const nonBillable = parseHours(nonBillableRaw);
    if (!projectNumber) {
      setError("Bitte Projekt wählen.");
      return;
    }
    if (contracts.length > 0 && !contractId && !defaults?.contractOptional) {
      setError("Bitte Vertrag wählen.");
      return;
    }
    if (positions.length > 0 && !contractPositionId) {
      setError("Bitte Vertragsposition wählen.");
      return;
    }
    if (!activity.trim()) {
      setError("Aktivität fehlt.");
      return;
    }
    if (hoursBillable == null || hoursBillable < 0) {
      setError("Verrechenbare Stunden ungültig (mindestens 0).");
      return;
    }
    if (nonBillable == null || nonBillable < 0) {
      setError("Nicht verrechenbare Stunden ungültig (mindestens 0).");
      return;
    }
    const hours = sumHours(hoursBillable, nonBillable);
    if (hours < 0.01 || hours > 24) {
      setError("Stunden ungültig (0.01–24).");
      return;
    }
    if (enableFavorites && saveAsFavorite) {
      const name = (favoriteName.trim() || activity.trim()).slice(0, 80);
      if (!name) {
        setError("Name für Favorit fehlt.");
        return;
      }
    }
    setBusy(true);
    try {
      await onSubmit({
        dayOfService,
        projectNumber,
        projectLabel: projectLabel || projectNumber,
        contractId: Number(contractId) || 0,
        contractPositionId: contractPositionId
          ? Number(contractPositionId)
          : null,
        activity: activity.trim(),
        memoText: memoText.trim(),
        hours,
        hoursBillable,
        issueId: defaults?.issueId ?? null,
        internalRemarkVerr: internalRemarkVerr.trim() || null,
        zeroHoursReason: zeroHoursReason.trim() || null,
      });
      if (enableFavorites && saveAsFavorite) {
        const name = (favoriteName.trim() || activity.trim()).slice(0, 80);
        try {
          await persistFavorite(name);
          setHint(`Favorit «${name}» gespeichert.`);
          setSaveAsFavorite(false);
          setFavoriteName("");
        } catch (favErr) {
          setHint(
            `Gebucht, aber Favorit nicht gespeichert: ${
              favErr instanceof Error ? favErr.message : String(favErr)
            }`
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveFavoriteOnly() {
    setError(null);
    setHint(null);
    if (!projectNumber) {
      setError("Bitte Projekt wählen.");
      return;
    }
    if (!activity.trim()) {
      setError("Aktivität fehlt.");
      return;
    }
    const name = (
      favoriteName.trim() ||
      activity.trim() ||
      projectLabel ||
      projectNumber
    ).slice(0, 80);
    setBusy(true);
    try {
      await persistFavorite(name);
      setHint(`Favorit «${name}» gespeichert.`);
      setSaveAsFavorite(false);
      setFavoriteName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const wide = layout === "wide";

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={cn("space-y-3", className)}
    >
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs whitespace-pre-wrap break-words text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/12 dark:text-sky-100">
          {hint}
        </p>
      ) : null}

      {enableFavorites ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <Star className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            Favoriten
          </div>
          {favoritesLoading && favorites.length === 0 ? (
            <p className="text-xs text-muted-foreground">Lade Favoriten…</p>
          ) : favorites.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Noch keine Favoriten — unten «Als Favorit speichern» wählen.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="inline-flex max-w-full items-center gap-0.5 rounded-lg border border-border/70 bg-muted/40 pl-1"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto max-w-[14rem] truncate px-2 py-1 text-left text-xs font-medium"
                    title={`${formatMariProjectLabel(fav.projectNumber, fav.projectLabel)} · ${fav.activity}`}
                    onClick={() => applyFavorite(fav)}
                  >
                    {fav.name}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mr-0.5 text-muted-foreground hover:text-rose-700"
                    aria-label={`Favorit «${fav.name}» löschen`}
                    title="Löschen"
                    onClick={() => void deleteFavorite(fav.id)}
                  >
                    <X className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {showCustomerChips ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            Teilnehmer / Kunde
          </div>
          {partnersLoading && partnerHits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Suche zu Betreff und Teilnehmern…
            </p>
          ) : partnerHits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Kein Treffer zu Betreff oder Teilnehmern — Projekt suchen.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {partnerHits.map((s) => {
                const label = partnerSuggestionChipLabel(s);
                const why = partnerSuggestionChipReason(s);
                const titleParts = [why, s.contactName, s.matchedEmail].filter(
                  Boolean
                );
                return (
                  <Button
                    key={`${s.cardCode}-${s.projectNumber || "none"}-${s.source}-${s.matchedEmail || ""}`}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-auto max-w-full whitespace-normal rounded-full px-3 py-1.5 text-left text-xs font-medium leading-snug"
                    title={titleParts.join(" · ") || label}
                    onClick={() => applyPartnerChip(s)}
                  >
                    <span className="block">{label}</span>
                    {why ? (
                      <span className="mt-0.5 block font-normal text-muted-foreground">
                        {why}
                      </span>
                    ) : null}
                  </Button>
                );
              })}
            </div>
          )}
          <p className="text-xs leading-snug text-muted-foreground">
            Nur aus diesem Termin: Betreff (C-/P-/V oder Name ab 4 Buchstaben)
            und externe Teilnehmer-Mails. Kollegen-Adressen werden ignoriert.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div
          className={cn(
            "grid gap-3",
            wide
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
              : "grid-cols-1 sm:grid-cols-2"
          )}
        >
          <div className="space-y-1">
            <Label htmlFor="tk-date" className="block truncate">
              Datum
            </Label>
            <Input
              id="tk-date"
              type="date"
              value={dayOfService}
              onChange={(e) => setDayOfService(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tk-hours" className="block leading-snug">
              Stunden (Summe)
            </Label>
            <p
              id="tk-hours"
              className="flex h-8 items-center rounded-lg border border-input bg-muted px-2.5 text-base font-medium tabular-nums md:text-sm"
              title="Summe aus verrechenbar und nicht verrechenbar"
              aria-live="polite"
            >
              {hoursFromSplit()}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tk-billable-h" className="block leading-snug">
              Verrechenbar
            </Label>
            <Input
              id="tk-billable-h"
              inputMode="decimal"
              className="tabular-nums"
              value={hoursBillableRaw}
              onChange={(e) => setHoursBillableRaw(e.target.value)}
              placeholder="0.25"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tk-nonbillable-h" className="block leading-snug">
              Nicht verrechenbar
            </Label>
            <Input
              id="tk-nonbillable-h"
              inputMode="decimal"
              className="tabular-nums"
              value={nonBillableRaw}
              onChange={(e) => setNonBillableRaw(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        {hoursHint ? (
          <p className="text-xs text-muted-foreground">{hoursHint}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="tk-project">Projekt</Label>
        <div className="relative">
          <Input
            id="tk-project"
            value={projectOpen ? projectQuery : projectLabel || projectQuery}
            onChange={(e) => {
              setProjectQuery(e.target.value);
              setProjectOpen(true);
            }}
            onFocus={() => {
              setProjectOpen(true);
              setProjectQuery("");
            }}
            placeholder="Suche z.B. Werk oder P200000"
            autoComplete="off"
          />
          {projectOpen ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
              {loadingProjects ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  Lade…
                </p>
              ) : projects.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  Keine Treffer
                </p>
              ) : (
                <ul>
                  {projects.slice(0, 80).map((p) => (
                    <li key={`${p.keyInternal}-${p.matchcode}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full flex-col items-start justify-start px-2.5 py-1.5 text-left text-xs font-normal hover:bg-muted"
                        onClick={() => selectProject(p)}
                      >
                        <span className="font-medium">{p.matchcode}</span>
                        <span className="text-muted-foreground">
                          {p.keyVisible || p.keyInternal}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <MariKeyPairPicker
          id="tk-contract"
          label="Vertrag"
          value={contractId}
          options={contracts}
          placeholder="Vertrag wählen…"
          emptyLabel="Kein Vertrag nötig"
          disabled={!projectNumber}
          onChange={(next) => {
            setContractId(next);
            setContractPositionId("");
          }}
        />
        {positions.length > 0 ? (
          <MariKeyPairPicker
            id="tk-pos"
            label="Vertragsposition"
            value={contractPositionId}
            options={positions}
            placeholder="Position wählen…"
            onChange={setContractPositionId}
          />
        ) : null}
      </div>

      <div className={cn("grid gap-3", wide && "lg:grid-cols-2")}>
        <div className="space-y-1">
          <Label htmlFor="tk-activity">Aktivität</Label>
          <Input
            id="tk-activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            maxLength={100}
            placeholder="z.B. Daily Call ANG CH"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-memo">Memo</Label>
          <Textarea
            id="tk-memo"
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            rows={wide ? 2 : 3}
            placeholder="Optional — z.B. Ort, Thema, Nacharbeit"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tk-int-bemerkung">
            Interne Bemerkung zur Verrechnung
          </Label>
          <select
            id="tk-int-bemerkung"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={internalRemarkVerr}
            onChange={(e) => setInternalRemarkVerr(e.target.value)}
          >
            <option value="">—</option>
            {TIMEKEEPING_INT_BEMERKUNG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-nuller">Grund für Nullerstunden</Label>
          <Input
            id="tk-nuller"
            value={zeroHoursReason}
            onChange={(e) => setZeroHoursReason(e.target.value)}
            maxLength={500}
            placeholder="Optional"
          />
        </div>
      </div>

      {enableFavorites ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <label className="flex items-center gap-2 text-[0.8125rem]">
            <input
              type="checkbox"
              checked={saveAsFavorite}
              onChange={(e) => {
                setSaveAsFavorite(e.target.checked);
                if (e.target.checked && !favoriteName.trim()) {
                  setFavoriteName(activity.trim().slice(0, 80));
                }
              }}
            />
            Als Favorit speichern
          </label>
          {saveAsFavorite ? (
            <div className="space-y-1">
              <Label htmlFor="tk-fav-name">Favoritenname</Label>
              <Input
                id="tk-fav-name"
                value={favoriteName}
                onChange={(e) => setFavoriteName(e.target.value)}
                maxLength={80}
                placeholder="z.B. Daily ANG"
              />
              <p className="text-[0.6875rem] text-muted-foreground">
                Speichert Projekt, Vertrag, Aktivität, Memo und Verrechenbarkeit
                (ohne Datum). Beim Buchen mit — oder nur Favorit speichern.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Speichere…" : submitLabel}
        </Button>
        {enableFavorites && saveAsFavorite ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void saveFavoriteOnly()}
          >
            Nur Favorit speichern
          </Button>
        ) : null}
        {projectOpen ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setProjectOpen(false)}
          >
            Projektliste schliessen
          </Button>
        ) : null}
      </div>
    </form>
  );
}
