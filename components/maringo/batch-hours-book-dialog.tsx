"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";
import {
  applyBatchHoursGuesses,
  batchHoursRowsForDay,
  batchHoursRowsNeedingGuess,
  batchHoursRowBlockers,
  type BatchHoursSourceEvent,
} from "@/lib/mari/batch-hours-rows";
import type { EventBookingRef } from "@/lib/mari/event-booking-ref";
import { formatBookHours } from "@/lib/mari/time-book-hours";
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
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());

  // The single event card fetches this recognition per tile; do it in one call.
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
        // Leave the rows as they are; the user can still pick a project.
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

  const isSelected = (eventId: string, preselected: boolean) =>
    preselected && !deselected.has(eventId);

  const selectedCount = rows.filter((r) =>
    isSelected(r.eventId, r.selected)
  ).length;

  function toggle(eventId: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl lg:max-w-4xl">
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
          <div className="space-y-1.5">
            <div className="hidden grid-cols-[1.5rem_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_4.5rem] gap-2 px-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span />
              <span>{t("batchHours.columnEvent")}</span>
              <span>{t("batchHours.columnProject")}</span>
              <span>{t("batchHours.columnContract")}</span>
              <span className="text-right">{t("batchHours.columnWorked")}</span>
              <span className="text-right">
                {t("batchHours.columnBillable")}
              </span>
            </div>

            {rows.map((row) => {
              const blockers = batchHoursRowBlockers(row);
              const selected = isSelected(row.eventId, row.selected);
              return (
                <div
                  key={row.eventId}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2 rounded-xl border border-border/60 bg-card px-2 py-2 sm:grid-cols-[1.5rem_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_4.5rem] sm:items-center"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-teal-700 sm:mt-0"
                    checked={selected}
                    onChange={() => toggle(row.eventId)}
                    aria-label={row.title}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {row.isAllDay
                          ? t("batchHours.allDay")
                          : [row.startHm, row.endHm].filter(Boolean).join("–")}
                      </span>
                      {!row.done ? (
                        <Badge variant="secondary" className="text-[0.625rem]">
                          {t("batchHours.notDone")}
                        </Badge>
                      ) : null}
                    </p>
                  </div>
                  <div className="min-w-0 text-sm sm:text-[0.8125rem]">
                    {row.defaults.projectNumber ? (
                      <span className="truncate">
                        {row.defaults.projectLabel || row.defaults.projectNumber}
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300">
                        {t("batchHours.missingProject")}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 text-sm text-muted-foreground sm:text-[0.8125rem]">
                    {row.defaults.contractVisible ||
                      (row.defaults.contractId != null &&
                      row.defaults.contractId > 0
                        ? String(row.defaults.contractId)
                        : row.defaults.contractOptional
                          ? t("batchHours.noContract")
                          : blockers.includes("contract")
                            ? t("batchHours.missingContract")
                            : t("batchHours.noContract"))}
                  </div>
                  <div className="text-sm tabular-nums sm:text-right">
                    {formatBookHours(row.defaults.hours)}
                  </div>
                  <div className="text-sm tabular-nums sm:text-right">
                    {formatBookHours(row.defaults.hoursBillable)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("batchHours.selectedCount", {
                selected: selectedCount,
                total: rows.length,
              })}
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
