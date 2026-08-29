"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import {
  findMariKeyPair,
  formatMariProjectLabel,
  type MariKeyPair,
} from "@/lib/mari/timekeeping-shared";
import { TIMEKEEPING_INT_BEMERKUNG_OPTIONS } from "@/lib/mari/timekeeping-udfs";
import type { MariTimeBookFavorite } from "@/lib/mari/time-book-favorites";
import { isAllowedCompanyEmail } from "@/lib/auth/allowed-email";
import {
  ATTENDEE_CONTACT_REASON,
  partnerSuggestionChipLabel,
  partnerSuggestionChipReason,
  type MariEmailPartnerSuggestion,
} from "@/lib/mari/customers-shared";
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";
import {
  isValidBookHours,
  parseBookHours,
  timeBookFollowBillableRaw,
  timeBookHoursFromDefaults,
  timeBookInitialBillableDirty,
  timeBookPostHours,
} from "@/lib/mari/time-book-hours";
import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

const REMARK_OPTION_LABEL: Record<string, MessageKey> = {
  Umbuchen: "timekeeping.remarkRepost",
  Verrechnen: "timekeeping.remarkBill",
  Rueckfrage: "timekeeping.remarkAsk",
  Begründung: "timekeeping.remarkReason",
};

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
  cardCode?: string | null;
  customerName?: string | null;
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
  contractVisible?: string | null;
  cardCode?: string | null;
  customerName?: string | null;
};

function zurichTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function MaringoTimeBookForm({
  defaults,
  submitLabel,
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
  const t = useT();
  const resolvedSubmit = submitLabel ?? t("common.book");
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
  const initialHours = timeBookHoursFromDefaults(defaults);
  const [hoursRaw, setHoursRaw] = useState(String(initialHours.hours));
  const [hoursBillableRaw, setHoursBillableRaw] = useState(
    String(initialHours.hoursBillable)
  );
  /** False while Verrechenbar still follows Geleistet in this form session. */
  const [billableDirty, setBillableDirty] = useState(
    timeBookInitialBillableDirty(initialHours)
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
      if (!res.ok) throw new Error(data.error || t("timekeeping.loadFavoritesFailed"));
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
        if (!res.ok) throw new Error(data.error || t("timekeeping.attendeeSearchFailed"));
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
      if (!res.ok) throw new Error(data.error || t("tickets.loadProjectsFailed"));
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
    const keepContractId = contractId;
    const includeInactive = Boolean(keepContractId || contractVisible);
    (async () => {
      try {
        const qs = includeInactive ? "?activeOnly=0" : "";
        const coRes = await fetch(
          `/api/maringo/timekeeping/projects/${encodeURIComponent(projectNumber)}/contracts${qs}`
        );
        const co = await coRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!coRes.ok) throw new Error(co.error || t("timekeeping.loadContractsFailed"));
        const nextContracts = (co.contracts || []) as MariKeyPair[];
        setContracts(nextContracts);
        const found =
          findMariKeyPair(nextContracts, keepContractId) ||
          findMariKeyPair(nextContracts, contractVisible);
        if (found) {
          if (found.keyInternal !== keepContractId) {
            setContractId(found.keyInternal);
          }
        } else if (keepContractId) {
          // keep preset even if not in the list — do not clear on load
        } else if (nextContracts.length === 1) {
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
        if (!res.ok) throw new Error(data.error || t("timekeeping.loadPositionsFailed"));
        const next = (data.positions || []) as MariKeyPair[];
        setPositions(next);
        const foundPos = findMariKeyPair(next, contractPositionId);
        if (foundPos) {
          if (foundPos.keyInternal !== contractPositionId) {
            setContractPositionId(foundPos.keyInternal);
          }
        } else if (contractPositionId) {
          // keep preset
        } else if (next.length === 1) {
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
      const split = timeBookHoursFromDefaults({
        hours: fav.hours,
        hoursBillable: fav.hoursBillable ?? fav.hours,
      });
      setHoursRaw(String(split.hours));
      setHoursBillableRaw(String(split.hoursBillable));
      setBillableDirty(timeBookInitialBillableDirty(split));
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
    const posted = timeBookPostHours(
      parseBookHours(hoursRaw) ?? 0,
      parseBookHours(hoursBillableRaw) ?? 0
    );
    const hours = posted.hours;
    const hoursBillable = posted.hoursBillable;
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
    if (!res.ok) throw new Error(data.error || t("timekeeping.saveFavoriteFailed"));
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
      setError(data.error || t("timekeeping.deleteFavoriteFailed"));
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHint(null);
    const hours = parseBookHours(hoursRaw);
    const hoursBillable = parseBookHours(hoursBillableRaw);
    if (!projectNumber) {
      setError(t("timekeeping.chooseProject"));
      return;
    }
    if (contracts.length > 0 && !contractId && !defaults?.contractOptional) {
      setError(t("timekeeping.chooseContractErr"));
      return;
    }
    if (positions.length > 0 && !contractPositionId) {
      setError(t("timekeeping.choosePositionErr"));
      return;
    }
    if (!activity.trim()) {
      setError(t("timekeeping.activityMissing"));
      return;
    }
    if (hours == null || !isValidBookHours(hours)) {
      setError(t("timekeeping.hoursInvalid"));
      return;
    }
    if (hoursBillable == null || !isValidBookHours(hoursBillable)) {
      setError(t("timekeeping.billableInvalid"));
      return;
    }
    const posted = timeBookPostHours(hours, hoursBillable);
    if (enableFavorites && saveAsFavorite) {
      const name = (favoriteName.trim() || activity.trim()).slice(0, 80);
      if (!name) {
        setError(t("timekeeping.favoriteNameMissing"));
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
        hours: posted.hours,
        hoursBillable: posted.hoursBillable,
        issueId: defaults?.issueId ?? null,
        internalRemarkVerr: internalRemarkVerr.trim() || null,
        zeroHoursReason: zeroHoursReason.trim() || null,
        contractVisible:
          findMariKeyPair(contracts, contractId)?.keyVisible ||
          contractVisible ||
          null,
        cardCode: defaults?.cardCode ?? null,
        customerName: defaults?.customerName ?? null,
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
      setError(t("timekeeping.chooseProject"));
      return;
    }
    if (!activity.trim()) {
      setError(t("timekeeping.activityMissing"));
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
            {t("common.favorites")}
          </div>
          {favoritesLoading && favorites.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("timekeeping.loadingFavorites")}
            </p>
          ) : favorites.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("timekeeping.noFavorites")}
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
                    aria-label={t("timekeeping.deleteFavoriteAria", {
                      name: fav.name,
                    })}
                    title={t("common.delete")}
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
            {t("timekeeping.attendeesCustomer")}
          </div>
          {partnersLoading && partnerHits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("timekeeping.searchingAttendees")}
            </p>
          ) : partnerHits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("timekeeping.noAttendeeHits")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {partnerHits.map((s) => {
                const label = partnerSuggestionChipLabel(s);
                const rawWhy = partnerSuggestionChipReason(s);
                const why =
                  rawWhy === "Aus dem Betreff"
                    ? t("timekeeping.fromSubject")
                    : rawWhy === ATTENDEE_CONTACT_REASON
                      ? t("timekeeping.attendeeContact")
                      : rawWhy;
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
            {t("timekeeping.attendeeHint")}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div
          className={cn(
            "grid gap-3",
            wide
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-3"
          )}
        >
          <div className="space-y-1">
            <Label htmlFor="tk-date" className="block truncate">
              {t("common.date")}
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
              {t("timekeeping.worked")}
            </Label>
            <Input
              id="tk-hours"
              inputMode="decimal"
              className="tabular-nums"
              value={hoursRaw}
              onChange={(e) => {
                const next = e.target.value;
                setHoursRaw(next);
                setHoursBillableRaw(
                  timeBookFollowBillableRaw(next, hoursBillableRaw, billableDirty)
                );
              }}
              placeholder="0.25"
              title={t("timekeeping.hoursHintWorked")}
              aria-describedby="tk-hours-hint"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tk-billable-h" className="block leading-snug">
              {t("timekeeping.billable")}
            </Label>
            <Input
              id="tk-billable-h"
              inputMode="decimal"
              className="tabular-nums"
              value={hoursBillableRaw}
              onChange={(e) => {
                setBillableDirty(true);
                setHoursBillableRaw(e.target.value);
              }}
              placeholder="0.25"
              title={t("timekeeping.hoursHintBillable")}
              aria-describedby="tk-hours-hint"
            />
          </div>
        </div>
        <p id="tk-hours-hint" className="text-xs leading-snug text-muted-foreground">
          {hoursHint || t("timekeeping.hoursFollowHint")}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tk-project">{t("common.project")}</Label>
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
            placeholder={t("timekeeping.searchProjectPh")}
            autoComplete="off"
          />
          {projectOpen ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
              {loadingProjects ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  {t("common.loading")}
                </p>
              ) : projects.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">
                  {t("common.noResults")}
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
          label={t("timekeeping.contract")}
          value={contractId}
          valueLabel={
            findMariKeyPair(contracts, contractId)
              ? null
              : contractVisible ||
                defaults?.contractVisible ||
                (contractId || null)
          }
          options={contracts}
          placeholder={t("timekeeping.chooseContract")}
          emptyLabel={t("timekeeping.noContractNeeded")}
          disabled={!projectNumber}
          onChange={(next) => {
            setContractId(next);
            setContractPositionId("");
          }}
        />
        {positions.length > 0 ? (
          <MariKeyPairPicker
            id="tk-pos"
            label={t("timekeeping.contractPosition")}
            value={contractPositionId}
            options={positions}
            placeholder={t("timekeeping.choosePosition")}
            onChange={setContractPositionId}
          />
        ) : null}
      </div>

      <div className={cn("grid gap-3", wide && "lg:grid-cols-2")}>
        <div className="space-y-1">
          <Label htmlFor="tk-activity">{t("timekeeping.activity")}</Label>
          <Input
            id="tk-activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            maxLength={100}
            placeholder={t("timekeeping.activityPh")}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-memo">{t("timekeeping.memo")}</Label>
          <Textarea
            id="tk-memo"
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            rows={wide ? 2 : 3}
            placeholder={t("timekeeping.memoPh")}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tk-int-bemerkung">
            {t("timekeeping.internalRemark")}
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
                {REMARK_OPTION_LABEL[o.value]
                  ? t(REMARK_OPTION_LABEL[o.value])
                  : o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-nuller">{t("timekeeping.zeroHoursReason")}</Label>
          <Input
            id="tk-nuller"
            value={zeroHoursReason}
            onChange={(e) => setZeroHoursReason(e.target.value)}
            maxLength={500}
            placeholder={t("timekeeping.optionalPh")}
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
            {t("timekeeping.saveAsFavorite")}
          </label>
          {saveAsFavorite ? (
            <div className="space-y-1">
              <Label htmlFor="tk-fav-name">{t("timekeeping.favoriteName")}</Label>
              <Input
                id="tk-fav-name"
                value={favoriteName}
                onChange={(e) => setFavoriteName(e.target.value)}
                maxLength={80}
                placeholder={t("timekeeping.favoriteNamePh")}
              />
              <p className="text-[0.6875rem] text-muted-foreground">
                {t("timekeeping.favoriteHint")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? t("common.saving") : resolvedSubmit}
        </Button>
        {enableFavorites && saveAsFavorite ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void saveFavoriteOnly()}
          >
            {t("timekeeping.saveFavoriteOnly")}
          </Button>
        ) : null}
        {projectOpen ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setProjectOpen(false)}
          >
            {t("timekeeping.closeProjectList")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
