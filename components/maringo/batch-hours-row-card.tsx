"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import type { BatchHoursRow } from "@/lib/mari/batch-hours-rows";
import {
  draftBlockers,
  setDraftBillable,
  setDraftHours,
  type BatchHoursDraft,
} from "@/lib/mari/batch-hours-draft";
import type { BatchRowStatus } from "@/lib/mari/batch-hours-run";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import { TIMEKEEPING_INT_BEMERKUNG_OPTIONS } from "@/lib/mari/timekeeping-udfs";

const FIELD = "h-8 text-[0.8125rem]";
const LABEL = "text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground";

export function BatchHoursRowCard({
  row,
  draft,
  selected,
  onToggle,
  onChange,
  projectHits,
  projectSearching,
  onProjectQuery,
  contracts,
  contractsLoading,
  onNeedContracts,
  status,
  error,
}: {
  row: BatchHoursRow;
  draft: BatchHoursDraft;
  selected: boolean;
  onToggle: () => void;
  onChange: (next: BatchHoursDraft) => void;
  projectHits: MariKeyPair[];
  projectSearching: boolean;
  onProjectQuery: (eventId: string, query: string) => void;
  contracts: MariKeyPair[] | undefined;
  contractsLoading: boolean;
  onNeedContracts: (eventId: string, projectNumber: string) => void;
  status?: BatchRowStatus;
  error?: string | null;
}) {
  const t = useT();
  const [projectOpen, setProjectOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blockers = draftBlockers(draft);

  return (
    <div
      className={
        "space-y-2 rounded-xl border bg-card px-2.5 py-2 " +
        (selected ? "border-teal-600/50" : "border-border/60")
      }
    >
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[1.25rem_minmax(0,1.6fr)_minmax(0,1.5fr)_minmax(0,1fr)_4.25rem_4.25rem] sm:items-end">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-teal-700 sm:mb-2 sm:mt-0"
          checked={selected}
          onChange={onToggle}
          aria-label={row.title}
        />

        <div className="min-w-0 sm:pb-1">
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
            {selected && blockers.length > 0 && !status ? (
              <span className="text-amber-700 dark:text-amber-300">
                {t("batchHours.rowIncomplete")}
              </span>
            ) : null}
            {status === "running" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {status === "booked" ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="size-3.5" aria-hidden />
                {t("batchHours.rowBooked")}
              </span>
            ) : null}
            {status === "booked" && error ? (
              <span className="min-w-0 text-amber-700 dark:text-amber-300">
                {error}
              </span>
            ) : null}
            {status === "failed" ? (
              <span className="min-w-0 text-destructive">{error}</span>
            ) : null}
          </p>
        </div>

        {/* Projekt — search hits replace the value, the input keeps the label */}
        <div className="relative min-w-0">
          <span className={LABEL}>{t("batchHours.columnProject")}</span>
          <Input
            className={FIELD}
            value={projectOpen ? query : draft.projectLabel || ""}
            placeholder={t("batchHours.projectSearch")}
            onFocus={() => {
              setProjectOpen(true);
              setQuery("");
            }}
            onBlur={() => window.setTimeout(() => setProjectOpen(false), 150)}
            onValueChange={(v) => {
              setQuery(v);
              onProjectQuery(row.eventId, v);
            }}
          />
          {projectOpen ? (
            <div className="absolute z-10 mt-1 max-h-52 w-[min(22rem,80vw)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
              {projectSearching ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("batchHours.projectSearching")}
                </p>
              ) : projectHits.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("batchHours.projectNoHits")}
                </p>
              ) : (
                projectHits.map((hit) => (
                  <button
                    key={`${hit.keyVisible}-${hit.company ?? 0}`}
                    type="button"
                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange({
                        ...draft,
                        projectNumber: hit.keyVisible,
                        projectLabel: `${hit.keyVisible} ${hit.matchcode}`.trim(),
                        contractId: null,
                        contractVisible: null,
                        contractPositionId: null,
                      });
                      setProjectOpen(false);
                      onNeedContracts(row.eventId, hit.keyVisible);
                    }}
                  >
                    <span className="font-medium">{hit.keyVisible}</span>{" "}
                    <span className="text-muted-foreground">{hit.matchcode}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* Vertrag — options load when the field is first used */}
        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.columnContract")}</span>
          <select
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[0.8125rem]"
            value={draft.contractId != null ? String(draft.contractId) : ""}
            onFocus={() => {
              if (draft.projectNumber) {
                onNeedContracts(row.eventId, draft.projectNumber);
              }
            }}
            onChange={(e) => {
              const raw = e.target.value;
              const hit = (contracts ?? []).find((c) => c.keyInternal === raw);
              onChange({
                ...draft,
                contractId: raw === "" ? null : Number(raw),
                contractVisible: hit?.keyVisible ?? draft.contractVisible,
                contractPositionId: null,
              });
            }}
          >
            <option value="">
              {draft.contractOptional
                ? t("batchHours.contractNone")
                : contractsLoading
                  ? t("batchHours.contractLoading")
                  : t("batchHours.contractKeep")}
            </option>
            {draft.contractId != null &&
            !(contracts ?? []).some(
              (c) => c.keyInternal === String(draft.contractId)
            ) ? (
              <option value={String(draft.contractId)}>
                {draft.contractVisible || String(draft.contractId)}
              </option>
            ) : null}
            {(contracts ?? []).map((c) => (
              <option key={c.keyInternal} value={c.keyInternal}>
                {c.keyVisible} {c.matchcode}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.columnWorked")}</span>
          <Input
            className={FIELD + " text-right tabular-nums"}
            value={draft.hoursRaw}
            inputMode="decimal"
            onValueChange={(v) => onChange(setDraftHours(draft, v))}
          />
        </div>
        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.columnBillable")}</span>
          <Input
            className={FIELD + " text-right tabular-nums"}
            value={draft.hoursBillableRaw}
            inputMode="decimal"
            onValueChange={(v) => onChange(setDraftBillable(draft, v))}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] sm:pl-[1.75rem]">
        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.fieldActivity")}</span>
          <Input
            className={FIELD}
            value={draft.activity}
            maxLength={100}
            onValueChange={(v) => onChange({ ...draft, activity: v })}
          />
        </div>
        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.fieldMemo")}</span>
          <Input
            className={FIELD}
            value={draft.memoText}
            maxLength={2000}
            onValueChange={(v) => onChange({ ...draft, memoText: v })}
          />
        </div>
        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.fieldRemark")}</span>
          <select
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[0.8125rem]"
            value={draft.internalRemarkVerr ?? ""}
            onChange={(e) =>
              onChange({
                ...draft,
                internalRemarkVerr: e.target.value || null,
              })
            }
          >
            <option value="">{t("batchHours.remarkNone")}</option>
            {TIMEKEEPING_INT_BEMERKUNG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.fieldZeroReason")}</span>
          <Input
            className={FIELD}
            value={draft.zeroHoursReason ?? ""}
            maxLength={500}
            placeholder={t("batchHours.zeroReasonPlaceholder")}
            onValueChange={(v) =>
              onChange({ ...draft, zeroHoursReason: v || null })
            }
          />
        </div>
      </div>
    </div>
  );
}
