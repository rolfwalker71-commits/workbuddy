"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  type BatchHoursDraft,
} from "@/lib/mari/batch-hours-draft";
import type { EventBookingRef } from "@/lib/mari/event-booking-ref";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import { toSwissDate } from "@/lib/utils/dates";

export function BatchHoursBookDialog({
  open,
  onOpenChange,
  date,
  events,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  events: readonly BatchHoursSourceEvent[];
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
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());

  // Seed drafts, and let a late recognition land — but never over an edit.
  useEffect(() => {
    setDrafts((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const row of rows) {
        if (touched.current.has(row.eventId)) continue;
        const seeded = draftFromRow(row);
        const before = next.get(row.eventId);
        if (
          !before ||
          before.projectNumber !== seeded.projectNumber ||
          before.contractId !== seeded.contractId
        ) {
          next.set(row.eventId, seeded);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

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

  const isSelected = (row: BatchHoursRow) =>
    row.selected && !deselected.has(row.eventId);

  const selectedRows = rows.filter(isSelected);
  const blockedCount = selectedRows.filter((row) => {
    const draft = drafts.get(row.eventId);
    return !draft || draftBlockers(draft).length > 0;
  }).length;

  function updateDraft(eventId: string, next: BatchHoursDraft) {
    touched.current.add(eventId);
    setDrafts((prev) => new Map(prev).set(eventId, next));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("batchHours.title", { date: toSwissDate(date) })}
          </DialogTitle>
          <DialogDescription>{t("batchHours.description")}</DialogDescription>
          {guessing ? (
            <p className="text-xs text-muted-foreground">
              {t("batchHours.recognising")}
            </p>
          ) : null}
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("batchHours.empty")}
          </p>
        ) : (
          <div className="space-y-2">
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
                    setDeselected((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.eventId)) next.delete(row.eventId);
                      else next.add(row.eventId);
                      return next;
                    })
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
                />
              );
            })}
          </div>
        )}

        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("batchHours.selectedCount", {
                selected: selectedRows.length,
                total: rows.length,
              })}
              {blockedCount > 0
                ? ` · ${blockedCount}× ${t("batchHours.rowIncomplete")}`
                : ""}
            </p>
            <Button type="button" size="sm" disabled>
              {t("batchHours.bookAll")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
