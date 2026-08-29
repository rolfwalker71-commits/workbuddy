"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import {
  formatPeriodLabel,
  formatMariProjectLabel,
  resolveTimePeriodRange,
  shiftTimePeriodAnchor,
  timeLineToBookPrefill,
  type MariTimeLine,
  type MariTimePeriod,
} from "@/lib/mari/timekeeping-shared";
import { formatOvertimeHours } from "@/lib/mari/timekeeping-overtime-shared";
import {
  MaringoTimeBookForm,
  type TimeBookFormDefaults,
  type TimeBookFormValues,
} from "@/components/maringo/maringo-time-book-form";
import { MaringoTimeLinesTable } from "@/components/maringo/maringo-time-lines-table";
import { MariHoursSplitSummary } from "@/components/maringo/mari-hours-split-summary";
import {
  MariSecondaryFlyoutShell,
  MARI_FLYOUT_MS,
  MARI_SECONDARY_FLYOUT_WIDTH_CLASS,
  useFlyoutPresence,
} from "@/components/maringo/maringo-flyout-chrome";
import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

const PERIOD_KEYS: Record<MariTimePeriod, MessageKey> = {
  day: "timekeeping.periodDay",
  week: "timekeeping.periodWeek",
  month: "timekeeping.periodMonth",
  quarter: "timekeeping.periodQuarter",
};

const PERIOD_PREV: Record<MariTimePeriod, MessageKey> = {
  day: "timekeeping.previousDay",
  week: "timekeeping.previousWeek",
  month: "timekeeping.previousMonth",
  quarter: "timekeeping.previousQuarter",
};

const PERIOD_NEXT: Record<MariTimePeriod, MessageKey> = {
  day: "timekeeping.nextDay",
  week: "timekeeping.nextWeek",
  month: "timekeeping.nextMonth",
  quarter: "timekeeping.nextQuarter",
};

const PERIOD_OVERVIEW: Record<MariTimePeriod, MessageKey> = {
  day: "timekeeping.dayOverview",
  week: "timekeeping.weekOverview",
  month: "timekeeping.monthOverview",
  quarter: "timekeeping.quarterOverview",
};

function zurichTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const PERIOD_IDS: MariTimePeriod[] = ["day", "week", "month", "quarter"];

export type MariTicketTimePanel = "book" | "lines" | "both";

export function MaringoTimekeepingPanel({
  className,
  /** Ticket-Kontext: Formular und/oder nur Buchungen dieses Tickets (keine Tagesübersicht). */
  ticketIssueId = null,
  /** Bei Ticket: nur Maske, nur Übersicht, oder beides. */
  ticketPanel = "both",
  bookDefaults = null,
  onTicketLinesChange,
}: {
  className?: string;
  ticketIssueId?: number | null;
  ticketPanel?: MariTicketTimePanel;
  bookDefaults?: TimeBookFormDefaults | null;
  onTicketLinesChange?: (lines: MariTimeLine[]) => void;
}) {
  const t = useT();
  const ticketMode = ticketIssueId != null && ticketIssueId > 0;
  const showBookForm = ticketMode && ticketPanel !== "lines";
  const showLinesOverview = !ticketMode || ticketPanel !== "book";
  const dayOverview = !ticketMode;
  const [date, setDate] = useState(zurichTodayYmd);
  const [period, setPeriod] = useState<MariTimePeriod>("day");
  const [fromDate, setFromDate] = useState(date);
  const [toDate, setToDate] = useState(date);
  const [lines, setLines] = useState<MariTimeLine[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [billableHours, setBillableHours] = useState(0);
  const [nonBillableHours, setNonBillableHours] = useState(0);
  const [overtimeHours, setOvertimeHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busyLineId, setBusyLineId] = useState<number | null>(null);
  const [editLine, setEditLine] = useState<MariTimeLine | null>(null);
  const [editDefaults, setEditDefaults] = useState<TimeBookFormDefaults | null>(
    null
  );
  const [editLoading, setEditLoading] = useState(false);
  const [bookFlyoutOpen, setBookFlyoutOpen] = useState(false);
  const [flyoutPortalReady, setFlyoutPortalReady] = useState(false);
  const [duplicateDefaults, setDuplicateDefaults] =
    useState<TimeBookFormDefaults | null>(null);
  const bookFlyoutPresence = useFlyoutPresence(bookFlyoutOpen);

  const onTicketLinesChangeRef = useRef(onTicketLinesChange);
  useEffect(() => {
    onTicketLinesChangeRef.current = onTicketLinesChange;
  }, [onTicketLinesChange]);

  useEffect(() => {
    setFlyoutPortalReady(true);
  }, []);

  useEffect(() => {
    if (!bookFlyoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[data-slot="dialog-overlay"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setBookFlyoutOpen(false);
      setDuplicateDefaults(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [bookFlyoutOpen]);

  const periodHint = useMemo(() => {
    try {
      const range = resolveTimePeriodRange(date, period);
      return formatPeriodLabel(period, range.fromDate, range.toDate);
    } catch {
      return "";
    }
  }, [date, period]);

  const applyLines = useCallback((next: MariTimeLine[]) => {
    setLines(next);
    const total =
      Math.round(next.reduce((s, l) => s + l.hours, 0) * 100) / 100;
    const billable =
      Math.round(next.reduce((s, l) => s + l.hoursBillable, 0) * 100) / 100;
    setTotalHours(total);
    setBillableHours(billable);
    setNonBillableHours(Math.round((total - billable) * 100) / 100);
    onTicketLinesChangeRef.current?.(next);
  }, []);

  const loadPeriod = useCallback(async (ymd: string, p: MariTimePeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/maringo/timekeeping/day?date=${encodeURIComponent(ymd)}&period=${p}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("timekeeping.loadBookingsFailed"));
      }
      setLines((data.lines || []) as MariTimeLine[]);
      setTotalHours(Number(data.totalHours) || 0);
      setBillableHours(Number(data.billableHours) || 0);
      setNonBillableHours(Number(data.nonBillableHours) || 0);
      setOvertimeHours(
        data.overtimeHours == null || !Number.isFinite(Number(data.overtimeHours))
          ? null
          : Number(data.overtimeHours)
      );
      setFromDate(String(data.fromDate || ymd));
      setToDate(String(data.toDate || ymd));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOvertimeHours(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTicketLines = useCallback(
    async (issueId: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/maringo/timekeeping/by-ticket?issueId=${issueId}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || t("timekeeping.loadTicketBookingsFailed")
          );
        }
        applyLines((data.lines || []) as MariTimeLine[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        applyLines([]);
      } finally {
        setLoading(false);
      }
    },
    [applyLines]
  );

  const reload = useCallback(async () => {
    if (ticketMode && ticketIssueId != null) {
      await loadTicketLines(ticketIssueId);
      return;
    }
    await loadPeriod(date, period);
  }, [ticketMode, ticketIssueId, loadTicketLines, loadPeriod, date, period]);

  useEffect(() => {
    if (ticketMode && ticketIssueId != null) {
      // Book-only flyout: lines load after submit via reload(); overview flyout loads here.
      if (ticketPanel === "book") return;
      void loadTicketLines(ticketIssueId);
      return;
    }
    void loadPeriod(date, period);
    // loadTicketLines/loadPeriod are stable; avoid re-fetch loops from parent callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketMode, ticketIssueId, ticketPanel, date, period]);

  async function book(values: TimeBookFormValues) {
    setStatus(null);
    setError(null);
    const payload = {
      ...values,
      issueId: ticketMode ? ticketIssueId : values.issueId,
    };
    const res = await fetch("/api/maringo/timekeeping/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("timekeeping.bookFailed"));
    const line = data.line as MariTimeLine | undefined;
    const warn =
      (line?.warning || "").trim() ||
      (typeof data.warning === "string" ? data.warning.trim() : "");
    const wasDuplicate = duplicateDefaults != null;
    setStatus(
      [
        t("timekeeping.bookedOn", {
          verb: wasDuplicate
            ? t("timekeeping.duplicated")
            : t("timekeeping.booked"),
          hours: values.hours,
          project: formatMariProjectLabel(
            values.projectNumber,
            values.projectLabel
          ),
        }) +
          (payload.issueId
            ? t("timekeeping.bookedTicketSuffix", { id: payload.issueId })
            : "") +
          (line?.lineId ? ` · #${line.lineId}` : ""),
        warn ? t("timekeeping.hintPrefix", { warn }) : null,
      ]
        .filter(Boolean)
        .join(" — ")
    );
    setDuplicateDefaults(null);
    setBookFlyoutOpen(false);
    setFormKey((k) => k + 1);
    if (!ticketMode) setDate(values.dayOfService);
    await reload();
  }

  async function fetchLineFormDefaults(
    line: MariTimeLine
  ): Promise<TimeBookFormDefaults> {
    const res = await fetch(`/api/maringo/timekeeping/lines/${line.lineId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("timekeeping.loadLineFailed"));
    const full = data.line as {
      serviceDate: string;
      projectNumber: string;
      projectCustomer?: string | null;
      activity: string;
      memo: string | null;
      hours: number;
      hoursBillable: number;
      billable: boolean;
      contractId: number;
      contractNumber?: string | null;
      contractName?: string | null;
      contractPositionId: number;
      issueId: number | null;
      internalRemarkVerr?: string | null;
      zeroHoursReason?: string | null;
    };
    const prefill = timeLineToBookPrefill(
      {
        serviceDate: full.serviceDate,
        projectNumber: full.projectNumber,
        projectCustomer: full.projectCustomer,
        activity: full.activity,
        memo: full.memo,
        hours: full.hours,
        hoursBillable: full.hoursBillable,
        billable: full.billable,
        contractId: full.contractId,
        contractVisible:
          full.contractNumber ||
          line.contractNumber ||
          null,
        contractPositionId: full.contractPositionId,
        issueId: full.issueId,
        internalRemarkVerr: full.internalRemarkVerr,
        zeroHoursReason: full.zeroHoursReason,
      },
      line
    );
    return {
      ...prefill,
      issueId: prefill.issueId ?? (ticketMode ? ticketIssueId : null),
    };
  }

  async function openEdit(line: MariTimeLine) {
    if (line.approved) {
      setError(t("timekeeping.cannotEditReleased"));
      return;
    }
    setError(null);
    setEditLine(line);
    setEditDefaults(null);
    setEditLoading(true);
    try {
      setEditDefaults(await fetchLineFormDefaults(line));
    } catch (err) {
      setEditLine(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditLoading(false);
    }
  }

  async function openDuplicate(line: MariTimeLine) {
    if (line.lineId <= 0) return;
    setError(null);
    setBusyLineId(line.lineId);
    try {
      const defaults = await fetchLineFormDefaults(line);
      setDuplicateDefaults(defaults);
      setFormKey((k) => k + 1);
      if (dayOverview || !showBookForm) {
        setBookFlyoutOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLineId(null);
    }
  }

  function closeBookFlyout() {
    setBookFlyoutOpen(false);
    setDuplicateDefaults(null);
  }

  async function saveEdit(values: TimeBookFormValues) {
    if (!editLine) return;
    setStatus(null);
    setError(null);
    const res = await fetch(
      `/api/maringo/timekeeping/lines/${editLine.lineId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          issueId: ticketMode ? ticketIssueId : values.issueId,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("timekeeping.patchFailed"));
    const line = data.line as MariTimeLine | undefined;
    setStatus(
      t("timekeeping.changedOn", {
        hours: values.hours,
        project: formatMariProjectLabel(
          values.projectNumber,
          values.projectLabel
        ),
      }) + (line?.lineId ? ` · #${line.lineId}` : "")
    );
    setEditLine(null);
    setEditDefaults(null);
    if (!ticketMode) setDate(values.dayOfService);
    await reload();
  }

  async function removeLine(line: MariTimeLine) {
    if (line.approved) {
      setError(t("timekeeping.cannotDeleteReleased"));
      return;
    }
    if (
      !window.confirm(
        t("timekeeping.confirmDeleteLine", {
          id: line.lineId,
          hours: line.hours,
          project: formatMariProjectLabel(
            line.projectNumber,
            line.projectCustomer
          ),
        })
      )
    ) {
      return;
    }
    setBusyLineId(line.lineId);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/timekeeping/lines/${line.lineId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("timekeeping.deleteFailed"));
      setStatus(t("timekeeping.deletedLine", { id: line.lineId }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLineId(null);
    }
  }

  const overviewTitle = ticketMode
    ? t("timekeeping.bookingsForTicket")
    : t(PERIOD_OVERVIEW[period]);

  const formDefaults: TimeBookFormDefaults = {
    dayOfService: date,
    hours: 0.25,
    hoursBillable: 0.25,
    billable: true,
    ...(bookDefaults || {}),
    ...(duplicateDefaults || {}),
    ...(ticketMode
      ? {
          issueId: ticketIssueId,
        }
      : {}),
  };
  const isDuplicateMode = duplicateDefaults != null;
  const bookSubmitLabel = isDuplicateMode
    ? t("timekeeping.bookDuplicate")
    : ticketMode
      ? t("timekeeping.bookOnTicket")
      : t("common.book");

  return (
    <div className={cn("space-y-4", className)}>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
          {error}
        </p>
      ) : null}
      {status && !dayOverview ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100">
          {status}
        </p>
      ) : null}

      <div className="space-y-4">
        {showBookForm ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock3 className="size-4" strokeWidth={APP_ICON_STROKE} />
                {t("timekeeping.bookTimeOnTicket", { id: ticketIssueId })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MaringoTimeBookForm
                key={`${formKey}-${ticketIssueId || "day"}`}
                defaults={formDefaults}
                onSubmit={book}
                layout="compact"
                submitLabel={bookSubmitLabel}
              />
            </CardContent>
          </Card>
        ) : null}

        {showLinesOverview ? (
          dayOverview ? (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
              <div className="space-y-2.5 border-b border-border/50 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-black tracking-tight">
                      {overviewTitle}
                    </h2>
                    {periodHint ? (
                      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                        {periodHint}
                        {fromDate !== toDate
                          ? ` · ${t("timekeeping.bookingsCountPlural", { count: lines.length })}`
                          : loading
                            ? ` · ${t("common.loading")}`
                            : ` · ${
                                lines.length === 1
                                  ? t("timekeeping.bookingsCount", {
                                      count: lines.length,
                                    })
                                  : t("timekeeping.bookingsCountPlural", {
                                      count: lines.length,
                                    })
                              }`}
                        {overtimeHours != null
                          ? t("timekeeping.overtimeValue", {
                              hours: formatOvertimeHours(overtimeHours),
                            })
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() =>
                          setDate(shiftTimePeriodAnchor(date, period, -1))
                        }
                        aria-label={t(PERIOD_PREV[period])}
                      >
                        <ChevronLeft
                          className="size-4"
                          strokeWidth={APP_ICON_STROKE}
                        />
                      </Button>
                      <div className="space-y-1">
                        <Label htmlFor="tk-day" className="sr-only">
                          {t("timekeeping.anchorDate")}
                        </Label>
                        <Input
                          id="tk-day"
                          type="date"
                          className="h-8 w-auto"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() =>
                          setDate(shiftTimePeriodAnchor(date, period, 1))
                        }
                        aria-label={t(PERIOD_NEXT[period])}
                      >
                        <ChevronRight
                          className="size-4"
                          strokeWidth={APP_ICON_STROKE}
                        />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void reload()}
                      disabled={loading}
                      aria-label={t("common.refresh")}
                    >
                      <RefreshCw
                        className={cn("size-4", loading && "animate-spin")}
                        strokeWidth={APP_ICON_STROKE}
                      />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-orange-500 text-white hover:bg-orange-600"
                      onClick={() => {
                        setDuplicateDefaults(null);
                        setBookFlyoutOpen(true);
                      }}
                    >
                      <Plus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                      {t("timekeeping.bookHours")}
                    </Button>
                  </div>
                </div>

                <div
                  className="inline-flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
                  role="group"
                  aria-label={t("timekeeping.period")}
                >
                  {PERIOD_IDS.map((id) => (
                    <Button
                      key={id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-auto rounded-md px-2.5 py-1 text-xs font-medium",
                        period === id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      aria-pressed={period === id}
                      onClick={() => setPeriod(id)}
                    >
                      {t(PERIOD_KEYS[id])}
                    </Button>
                  ))}
                </div>

                <MariHoursSplitSummary
                  totalHours={totalHours}
                  billableHours={billableHours}
                  nonBillableHours={nonBillableHours}
                  overtimeHours={overtimeHours}
                  overtimeHint={
                    period === "day"
                      ? t("timekeeping.saldo")
                      : t("timekeeping.stand", {
                          label: formatPeriodLabel("day", date, date),
                        })
                  }
                  footnote={
                    loading
                      ? t("timekeeping.loadingBookings")
                      : periodHint
                        ? `${
                            lines.length === 1
                              ? t("timekeeping.bookingsCount", {
                                  count: lines.length,
                                })
                              : t("timekeeping.bookingsCountPlural", {
                                  count: lines.length,
                                })
                          } · ${periodHint}`
                        : lines.length === 1
                          ? t("timekeeping.bookingsCount", {
                              count: lines.length,
                            })
                          : t("timekeeping.bookingsCountPlural", {
                              count: lines.length,
                            })
                  }
                  totalHint={t("timekeeping.period")}
                />
              </div>

              <div className="px-3 py-2.5">
                <MaringoTimeLinesTable
                  lines={lines}
                  totalHours={totalHours}
                  billableHours={billableHours}
                  nonBillableHours={nonBillableHours}
                  summaryVariant="none"
                  variant="table"
                  emptyText={
                    loading
                      ? t("timekeeping.loadingBookings")
                      : period === "day"
                        ? t("timekeeping.noBookingsDay")
                        : t("timekeeping.noBookingsPeriod")
                  }
                  onEdit={(l) => void openEdit(l)}
                  onDuplicate={(l) => void openDuplicate(l)}
                  onDelete={removeLine}
                  busyLineId={busyLineId}
                />
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{overviewTitle}</CardTitle>
                      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                        {loading
                          ? t("common.loading")
                          : lines.length === 1
                            ? t("timekeeping.bookingsCount", {
                                count: lines.length,
                              })
                            : t("timekeeping.bookingsCountPlural", {
                                count: lines.length,
                              })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void reload()}
                      disabled={loading}
                      aria-label={t("common.refresh")}
                    >
                      <RefreshCw
                        className={cn("size-4", loading && "animate-spin")}
                        strokeWidth={APP_ICON_STROKE}
                      />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <MaringoTimeLinesTable
                  lines={lines}
                  totalHours={totalHours}
                  billableHours={billableHours}
                  nonBillableHours={nonBillableHours}
                  summaryVariant="chart"
                  emptyText={
                    loading
                      ? t("timekeeping.loadingBookings")
                      : t("timekeeping.noBookingsOnTicket")
                  }
                  onEdit={(l) => void openEdit(l)}
                  onDuplicate={(l) => void openDuplicate(l)}
                  onDelete={removeLine}
                  busyLineId={busyLineId}
                />
              </CardContent>
            </Card>
          )
        ) : null}
      </div>

      {flyoutPortalReady && bookFlyoutPresence.mounted
        ? createPortal(
            <div className="fixed inset-0 z-[1000]">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "absolute inset-0 h-auto w-full rounded-none border-0 bg-black/20 p-0 transition-opacity ease-in-out hover:bg-black/20",
                  bookFlyoutPresence.entered ? "opacity-100" : "opacity-0"
                )}
                style={{ transitionDuration: `${MARI_FLYOUT_MS}ms` }}
                aria-label={t("tickets.closeFlyout")}
                onClick={closeBookFlyout}
              />
              <MariSecondaryFlyoutShell
                title={
                  isDuplicateMode
                    ? t("timekeeping.duplicateBooking")
                    : t("timekeeping.hoursEntry")
                }
                description={
                  isDuplicateMode
                    ? t("timekeeping.adjustThenSave")
                    : t("timekeeping.captureNewTime")
                }
                onClose={closeBookFlyout}
                widthClass={MARI_SECONDARY_FLYOUT_WIDTH_CLASS}
                zIndex={1010}
                offsetPx={0}
                open={bookFlyoutPresence.entered}
              >
                {status ? (
                  <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100">
                    {status}
                  </p>
                ) : null}
                {error ? (
                  <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
                    {error}
                  </p>
                ) : null}
                <MaringoTimeBookForm
                  key={`${formKey}-day-flyout`}
                  defaults={formDefaults}
                  onSubmit={book}
                  layout="compact"
                  submitLabel={bookSubmitLabel}
                />
              </MariSecondaryFlyoutShell>
            </div>,
            document.body
          )
        : null}

      <Dialog
        open={editLine != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditLine(null);
            setEditDefaults(null);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("timekeeping.editBooking")}
              {editLine ? ` · #${editLine.lineId}` : ""}
            </DialogTitle>
            <DialogDescription>
              {t("timekeeping.editBookingHint")}
            </DialogDescription>
          </DialogHeader>
          {editLoading || !editDefaults ? (
            <p className="text-sm text-muted-foreground">
              {t("timekeeping.loadingLine")}
            </p>
          ) : (
            <MaringoTimeBookForm
              key={`edit-${editLine?.lineId}`}
              defaults={editDefaults}
              submitLabel={t("common.save")}
              onSubmit={saveEdit}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
