"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/components/i18n/locale-provider";
import { BatchHoursRowCard } from "@/components/maringo/batch-hours-row-card";
import {
  applyBatchHoursGuesses,
  batchHoursRowsForDay,
  batchHoursRowsNeedingGuess,
  type BatchHoursRow,
  type BatchHoursSourceEvent,
} from "@/lib/mari/batch-hours-rows";
import {
  draftFromRow,
  draftBlockers,
  draftToLinePayload,
  type BatchHoursDraft,
} from "@/lib/mari/batch-hours-draft";
import {
  batchRunFullySucceeded,
  batchRunPending,
  batchRunProgress,
  finishBatchRun,
  markRowBooked,
  markRowFailed,
  markRowRunning,
  startBatchRun,
  type BatchRunState,
} from "@/lib/mari/batch-hours-run";
import type { PersistedBatchDay } from "@/lib/mari/batch-hours-store";
import type { EventBookingRef } from "@/lib/mari/event-booking-ref";
import {
  findMariKeyPair,
  type MariKeyPair,
} from "@/lib/mari/timekeeping-shared";
import { toSwissDate } from "@/lib/utils/dates";

export function BatchHoursBookDialog({
  open,
  onOpenChange,
  date,
  events,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  events: readonly BatchHoursSourceEvent[];
  /** At least one line landed in Maringo — reload the day. */
  onBooked?: () => void;
}) {
  const t = useT();
  const baseRows = useMemo(() => batchHoursRowsForDay(events), [events]);
  const [guesses, setGuesses] = useState<Map<string, EventBookingRef | null>>(
    () => new Map()
  );
  const [guessing, setGuessing] = useState(false);
  const rows = useMemo(
    () => applyBatchHoursGuesses(baseRows, guesses),
    [baseRows, guesses]
  );

  const [drafts, setDrafts] = useState<Map<string, BatchHoursDraft>>(
    () => new Map()
  );
  const touched = useRef<Set<string>>(new Set());
  /** Explicit overrides; a row without one follows its preselection. */
  const [selection, setSelection] = useState<Map<string, boolean>>(
    () => new Map()
  );

  // Saved drafts for this day, loaded once per open. Until they are in, no
  // save may run — it would overwrite them with freshly seeded defaults.
  const [stored, setStored] = useState<PersistedBatchDay | null>(null);
  useEffect(() => {
    if (!open) {
      setStored(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/maringo/batch-hours-draft?date=${encodeURIComponent(date)}`
        );
        const json = (await res.json().catch(() => ({}))) as {
          drafts?: PersistedBatchDay;
        };
        if (!cancelled) setStored(json.drafts ?? {});
      } catch {
        if (!cancelled) setStored({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, date]);

  // Seed drafts, and let a late recognition land — but never over an edit.
  useEffect(() => {
    if (stored == null) return;
    setDrafts((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const row of rows) {
        if (touched.current.has(row.eventId)) continue;
        const seeded = draftFromRow(row);
        const saved = stored[row.eventId];
        const merged = saved ? { ...seeded, ...saved } : seeded;
        // A saved row counts as edited, so no guess may overwrite it later.
        if (saved) touched.current.add(row.eventId);
        const before = next.get(row.eventId);
        if (
          !before ||
          before.projectNumber !== merged.projectNumber ||
          before.contractId !== merged.contractId ||
          Boolean(saved)
        ) {
          next.set(row.eventId, merged);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows, stored]);

  // Save what the user changed, debounced.
  useEffect(() => {
    if (!open || stored == null || touched.current.size === 0) return;
    const eventIds = rows.map((r) => r.eventId);
    const payload: Record<string, BatchHoursDraft> = {};
    for (const id of eventIds) {
      if (!touched.current.has(id)) continue;
      const draft = drafts.get(id);
      if (draft) payload[id] = draft;
    }
    const timer = window.setTimeout(() => {
      void fetch("/api/maringo/batch-hours-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, eventIds, drafts: payload }),
      }).catch(() => {
        /* a lost draft is not worth interrupting the user for */
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [open, date, rows, drafts, stored]);

  const pendingGuessKey = useMemo(() => {
    if (!open) return "";
    return batchHoursRowsNeedingGuess(baseRows)
      .filter((r) => !guesses.has(r.eventId))
      .map((r) => r.eventId)
      .join("|");
  }, [open, baseRows, guesses]);

  useEffect(() => {
    if (!pendingGuessKey) return;
    const ids = new Set(pendingGuessKey.split("|"));
    const ask = baseRows.filter((r) => ids.has(r.eventId));
    if (ask.length === 0) return;
    let cancelled = false;
    void (async () => {
      setGuessing(true);
      try {
        const res = await fetch("/api/maringo/event-booking/recognize-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: ask.map((r) => ({
              eventId: r.eventId,
              title: r.title,
              attendeeEmails: r.attendeeEmails,
            })),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          results?: Array<{ eventId: string; booking: EventBookingRef | null }>;
        };
        if (cancelled) return;
        setGuesses((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.set(id, null);
          for (const hit of json.results ?? []) {
            next.set(hit.eventId, hit.booking ?? null);
          }
          return next;
        });
      } catch {
        if (cancelled) return;
        setGuesses((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.set(id, null);
          return next;
        });
      } finally {
        if (!cancelled) setGuessing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingGuessKey, baseRows]);

  // One shared project search — only the focused row queries.
  const [projectRow, setProjectRow] = useState<string | null>(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectHits, setProjectHits] = useState<MariKeyPair[]>([]);
  const [projectSearching, setProjectSearching] = useState(false);

  useEffect(() => {
    if (!projectRow) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setProjectSearching(true);
        try {
          const res = await fetch(
            `/api/maringo/timekeeping/projects?q=${encodeURIComponent(projectQuery)}`
          );
          const json = (await res.json().catch(() => ({}))) as {
            projects?: MariKeyPair[];
          };
          if (!cancelled) setProjectHits(json.projects ?? []);
        } catch {
          if (!cancelled) setProjectHits([]);
        } finally {
          if (!cancelled) setProjectSearching(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectRow, projectQuery]);

  const [contractsByKey, setContractsByKey] = useState<
    Map<string, MariKeyPair[]>
  >(() => new Map());
  const [contractsLoading, setContractsLoading] = useState<Set<string>>(
    () => new Set()
  );

  const contractsAsked = useRef<Set<string>>(new Set());
  const needContracts = useCallback(
    (eventId: string, projectNumber: string) => {
      const key = `${eventId}:${projectNumber}`;
      if (contractsAsked.current.has(key)) return;
      contractsAsked.current.add(key);
      setContractsLoading((prev) => new Set(prev).add(key));
      void (async () => {
        try {
          const res = await fetch(
            `/api/maringo/timekeeping/projects/${encodeURIComponent(projectNumber)}/contracts?activeOnly=0`
          );
          const json = (await res.json().catch(() => ({}))) as {
            contracts?: MariKeyPair[];
          };
          setContractsByKey((prev) =>
            new Map(prev).set(key, json.contracts ?? [])
          );
        } catch {
          setContractsByKey((prev) => new Map(prev).set(key, []));
        } finally {
          setContractsLoading((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      })();
    },
    []
  );

  // Warm the contract lists as soon as a row has a project, so the dropdown
  // shows its real label right away instead of a bare id that changes later.
  useEffect(() => {
    if (!open) return;
    for (const row of rows) {
      const projectNumber = drafts.get(row.eventId)?.projectNumber;
      if (projectNumber) needContracts(row.eventId, projectNumber);
    }
  }, [open, rows, drafts, needContracts]);

  /**
   * The recognition may hand us a contract by its visible number while the
   * dropdown keys on the internal id. Once a row's contract list is in, map
   * the value onto the real option — otherwise the field shows a bare number
   * that matches nothing. Not an edit, so it is not marked as touched.
   */
  useEffect(() => {
    if (contractsByKey.size === 0) return;
    setDrafts((prev) => {
      let next = prev;
      for (const row of rows) {
        const draft = next.get(row.eventId);
        if (!draft?.projectNumber) continue;
        const options = contractsByKey.get(
          `${row.eventId}:${draft.projectNumber}`
        );
        if (!options || options.length === 0) continue;
        const hit =
          findMariKeyPair(options, draft.contractId) ||
          findMariKeyPair(options, draft.contractVisible);
        if (!hit) {
          // The recognised contract is not one of this project's — drop it
          // instead of booking a number that matches nothing in Maringo.
          if (draft.contractId == null && !draft.contractVisible) continue;
          if (next === prev) next = new Map(prev);
          next.set(row.eventId, {
            ...draft,
            contractId: null,
            contractVisible: null,
          });
          continue;
        }
        const internal = Number(hit.keyInternal);
        if (!Number.isInteger(internal)) continue;
        if (
          draft.contractId === internal &&
          draft.contractVisible === hit.keyVisible
        ) {
          continue;
        }
        if (next === prev) next = new Map(prev);
        next.set(row.eventId, {
          ...draft,
          contractId: internal,
          contractVisible: hit.keyVisible,
        });
      }
      return next;
    });
  }, [rows, contractsByKey]);

  /** Recognition or a contract list is still on its way. */
  const busy = guessing || contractsLoading.size > 0;

  const isSelected = (row: BatchHoursRow) =>
    selection.get(row.eventId) ?? row.selected;

  const selectedRows = rows.filter(isSelected);
  const blockedCount = selectedRows.filter((row) => {
    const draft = drafts.get(row.eventId);
    return !draft || draftBlockers(draft).length > 0;
  }).length;

  function updateDraft(eventId: string, next: BatchHoursDraft) {
    touched.current.add(eventId);
    setDrafts((prev) => new Map(prev).set(eventId, next));
  }

  const [run, setRun] = useState<BatchRunState | null>(null);
  const bookable = selectedRows.filter((row) => {
    const draft = drafts.get(row.eventId);
    return draft && draftBlockers(draft).length === 0;
  });

  async function bookRow(
    row: BatchHoursRow,
    draft: BatchHoursDraft
  ): Promise<{
    lineId: number | null;
    stampedDone: boolean;
    warning: string | null;
  }> {
    const payload = draftToLinePayload(row, draft);
    if (!payload) throw new Error(t("batchHours.rowIncomplete"));

    const res = await fetch("/api/maringo/timekeeping/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      line?: { lineId?: number };
    };
    if (!res.ok) throw new Error(json.error || t("timekeeping.bookFailed"));
    const rawLineId = Number(json.line?.lineId);
    const lineId = Number.isInteger(rawLineId) && rawLineId > 0 ? rawLineId : null;

    // Stamp the event as booked so it drops out of this list next time.
    // The line is already in Maringo from here on, so a failure below must not
    // mark the row failed — a retry would book it a second time.
    let warning: string | null = null;
    const stampRes = await fetch("/api/maringo/timekeeping/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventProvider: "microsoft",
        eventId: row.eventId,
        calendarId: row.calendarId,
        eventDate: row.date,
        startHm: row.startHm,
        endHm: row.endHm,
        title: row.title,
        memo: payload.memoText,
        // The stamp rejects 0; a zero-hours booking still gets its line.
        hours: payload.hours > 0 ? payload.hours : null,
        hoursBillable: payload.hoursBillable,
        issueId: payload.issueId,
        bookedLineId: lineId,
        seriesMasterId: row.seriesMasterId,
        iCalUId: row.iCalUId,
        cardCode: row.defaults.cardCode ?? null,
        customerName: row.defaults.customerName ?? null,
        projectNumber: payload.projectNumber,
        projectLabel: draft.projectLabel,
        contractId: payload.contractId,
        contractVisible: draft.contractVisible,
      }),
    });
    const stampJson = (await stampRes.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!stampRes.ok) {
      warning = stampJson.error || t("timekeeping.stampFailed");
    }

    // The ✅ in the Outlook subject. Idempotent, so already-done rows are fine.
    let stampedDone = false;
    try {
      const doneRes = await fetch("/api/microsoft/calendar/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "done",
          eventId: row.eventId,
          calendarId: row.calendarId || undefined,
        }),
      });
      stampedDone = doneRes.ok;
    } catch {
      stampedDone = false;
    }
    if (!stampedDone) {
      warning = warning || t("batchHours.doneStampFailed");
    }
    return { lineId, stampedDone, warning };
  }

  async function runBatch() {
    const ids = bookable.map((r) => r.eventId);
    if (ids.length === 0) return;
    let state = startBatchRun(ids, run);
    setRun(state);
    for (const eventId of batchRunPending(state)) {
      const row = rows.find((r) => r.eventId === eventId);
      const draft = drafts.get(eventId);
      if (!row || !draft) continue;
      state = markRowRunning(state, eventId);
      setRun(state);
      try {
        const { lineId, stampedDone, warning } = await bookRow(row, draft);
        state = markRowBooked(state, eventId, lineId, stampedDone, warning);
      } catch (err) {
        state = markRowFailed(
          state,
          eventId,
          err instanceof Error ? err.message : String(err)
        );
      }
      setRun(state);
    }
    state = finishBatchRun(state);
    setRun(state);
    if (batchRunFullySucceeded(state)) {
      onOpenChange(false);
      onBooked?.();
    }
  }

  const progress = run ? batchRunProgress(run) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("batchHours.title", { date: toSwissDate(date) })}
          </DialogTitle>
          <DialogDescription>{t("batchHours.description")}</DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("batchHours.empty")}
          </p>
        ) : (
          <div className="relative space-y-2">
            {busy ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-background/60">
                <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-popover px-3 py-1.5 text-sm shadow-lg">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t("batchHours.pleaseWait")}
                </span>
              </div>
            ) : null}
            {rows.map((row) => {
              const draft = drafts.get(row.eventId);
              if (!draft) return null;
              const key = draft.projectNumber
                ? `${row.eventId}:${draft.projectNumber}`
                : "";
              return (
                <BatchHoursRowCard
                  key={row.eventId}
                  row={row}
                  draft={draft}
                  selected={isSelected(row)}
                  onToggle={() =>
                    setSelection((prev) =>
                      new Map(prev).set(row.eventId, !isSelected(row))
                    )
                  }
                  onChange={(next) => updateDraft(row.eventId, next)}
                  projectHits={projectRow === row.eventId ? projectHits : []}
                  projectSearching={
                    projectRow === row.eventId && projectSearching
                  }
                  onProjectQuery={(eventId, q) => {
                    setProjectRow(eventId);
                    setProjectQuery(q);
                  }}
                  contracts={key ? contractsByKey.get(key) : undefined}
                  contractsLoading={key ? contractsLoading.has(key) : false}
                  onNeedContracts={needContracts}
                  status={run?.byId[row.eventId]?.status}
                  error={
                    run?.byId[row.eventId]?.error ??
                    run?.byId[row.eventId]?.warning ??
                    null
                  }
                />
              );
            })}
          </div>
        )}

        {rows.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            {progress ? (
              <div className="space-y-1">
                <Progress value={progress.percent} />
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t("batchHours.progress", {
                    finished: progress.finished,
                    total: progress.total,
                  })}
                  {progress.failed > 0
                    ? ` · ${t("batchHours.runFailed", { count: progress.failed })}`
                    : ""}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("batchHours.selectedCount", {
                  selected: selectedRows.length,
                  total: rows.length,
                })}
                {blockedCount > 0
                  ? ` · ${blockedCount}× ${t("batchHours.rowIncomplete")}`
                  : ""}
              </p>
              <Button
                type="button"
                size="sm"
                disabled={bookable.length === 0 || Boolean(run?.running)}
                onClick={() => void runBatch()}
              >
                {run?.running ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                {progress && progress.failed > 0 && !run?.running
                  ? t("batchHours.retryFailed")
                  : t("batchHours.bookAll")}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
