"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import type { BatchHoursRow } from "@/lib/mari/batch-hours-rows";
import {
  setDraftBillable,
  setDraftHours,
  type BatchHoursBlocker,
  type BatchHoursDraft,
} from "@/lib/mari/batch-hours-draft";
import type { BatchRowStatus } from "@/lib/mari/batch-hours-run";
import {
  findMariKeyPair,
  formatMariProjectLabel,
  type MariKeyPair,
} from "@/lib/mari/timekeeping-shared";
import { TIMEKEEPING_INT_BEMERKUNG_OPTIONS } from "@/lib/mari/timekeeping-udfs";

const FIELD = "h-9 w-full text-[0.8125rem]";
const SELECT =
  "h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-[0.8125rem]";
const LABEL =
  "mb-0.5 block text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground";

export function BatchHoursRowCard({
  row,
  draft,
  selected,
  blockers,
  onToggle,
  onChange,
  projectHits,
  projectSearching,
  onProjectQuery,
  contracts,
  positions,
  optionsLoading,
  onNeedContracts,
  status,
  error,
}: {
  row: BatchHoursRow;
  draft: BatchHoursDraft;
  selected: boolean;
  blockers: BatchHoursBlocker[];
  onToggle: () => void;
  onChange: (next: BatchHoursDraft) => void;
  projectHits: MariKeyPair[];
  projectSearching: boolean;
  onProjectQuery: (eventId: string, query: string) => void;
  contracts: MariKeyPair[] | undefined;
  positions: MariKeyPair[];
  optionsLoading: boolean;
  onNeedContracts: (eventId: string, projectNumber: string) => void;
  status?: BatchRowStatus;
  error?: string | null;
}) {
  const t = useT();
  const [projectOpen, setProjectOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Recognition may deliver a visible contract number, the options key on the
  // internal id — match tolerantly, the way the single dialog does.
  const contractHit =
    findMariKeyPair(contracts ?? [], draft.contractId) ||
    findMariKeyPair(contracts ?? [], draft.contractVisible);
  const positionHit = findMariKeyPair(positions, draft.contractPositionId);

  return (
    <div
      className={
        "space-y-2.5 rounded-xl border bg-card p-3 " +
        (selected ? "border-teal-600/50" : "border-border/60")
      }
    >
      {/* Line 1 — what and how long */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-teal-700"
          checked={selected}
          onChange={onToggle}
          aria-label={row.title}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{row.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
            {status === "running" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {status === "booked" ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="size-3.5" aria-hidden />
                {t("batchHours.rowBooked")}
              </span>
            ) : null}
            {selected && blockers.length > 0 && !status ? (
              <span className="text-amber-700 dark:text-amber-300">
                {t("batchHours.rowIncomplete")}
              </span>
            ) : null}
          </p>
        </div>
        <div className="w-[5.25rem] shrink-0">
          <span className={LABEL}>{t("batchHours.columnWorked")}</span>
          <Input
            className={FIELD + " text-right tabular-nums"}
            value={draft.hoursRaw}
            inputMode="decimal"
            onValueChange={(v) => onChange(setDraftHours(draft, v))}
          />
        </div>
        <div className="w-[5.25rem] shrink-0">
          <span className={LABEL}>{t("batchHours.columnBillable")}</span>
          <Input
            className={FIELD + " text-right tabular-nums"}
            value={draft.hoursBillableRaw}
            inputMode="decimal"
            onValueChange={(v) => onChange(setDraftBillable(draft, v))}
          />
        </div>
      </div>

      {/* Maringo's own words, full width so nothing gets cut */}
      {status === "failed" && error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs leading-snug text-destructive">
          {error}
        </p>
      ) : null}
      {status === "booked" && error ? (
        <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs leading-snug text-amber-800 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      {/* Line 2 — where it books to */}
      <div className="grid gap-2.5 md:grid-cols-3">
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
            <div className="absolute z-20 mt-1 max-h-56 w-[min(26rem,85vw)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
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
                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs leading-snug hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange({
                        ...draft,
                        projectNumber: hit.keyVisible,
                        projectLabel: formatMariProjectLabel(
                          hit.keyVisible,
                          hit.matchcode
                        ),
                        contractId: null,
                        contractVisible: null,
                        contractPositionId: null,
                      });
                      setProjectOpen(false);
                      onNeedContracts(row.eventId, hit.keyVisible);
                    }}
                  >
                    <span className="font-medium">{hit.keyVisible}</span>{" "}
                    <span className="text-muted-foreground">
                      {hit.matchcode}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <span className={LABEL}>{t("batchHours.columnContract")}</span>
          <select
            className={SELECT}
            value={contractHit?.keyInternal ?? ""}
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
                contractVisible: hit?.keyVisible ?? null,
                contractPositionId: null,
              });
            }}
          >
            <option value="">
              {draft.contractOptional
                ? t("batchHours.contractNone")
                : optionsLoading
                  ? t("batchHours.contractLoading")
                  : t("batchHours.contractKeep")}
            </option>
            {(draft.contractId != null || draft.contractVisible) &&
            !contractHit ? (
              <option value={String(draft.contractId ?? "")}>
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
          <span className={LABEL}>{t("batchHours.columnPosition")}</span>
          <select
            className={
              SELECT +
              (blockers.includes("position") ? " border-amber-600" : "")
            }
            value={positionHit?.keyInternal ?? ""}
            disabled={draft.contractId == null || draft.contractId <= 0}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                ...draft,
                contractPositionId: raw === "" ? null : Number(raw),
              });
            }}
          >
            <option value="">
              {optionsLoading
                ? t("batchHours.contractLoading")
                : positions.length === 0
                  ? t("batchHours.positionNone")
                  : t("batchHours.positionPick")}
            </option>
            {positions.map((p) => (
              <option key={p.keyInternal} value={p.keyInternal}>
                {p.keyVisible} {p.matchcode}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Line 3 — the text Maringo stores with the line */}
      <div className="grid gap-2.5 md:grid-cols-4">
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
            className={SELECT}
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
