/**
 * Editable state of one batch row plus its mapping onto the timekeeping POST
 * body. Pure, so the row rules are testable without a browser.
 */

import type { BatchHoursRow } from "@/lib/mari/batch-hours-rows";
import { roundBookHours } from "@/lib/mari/time-book-hours";
import { TIMEKEEPING_INT_BEMERKUNG_OPTIONS } from "@/lib/mari/timekeeping-udfs";

export type BatchHoursDraft = {
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
  contractVisible: string | null;
  contractPositionId: number | null;
  contractOptional: boolean;
  activity: string;
  memoText: string;
  /** Raw input strings — parsed on submit so typing stays unfought. */
  hoursRaw: string;
  hoursBillableRaw: string;
  /** Verrechenbar follows Geleistet until the user edits it. */
  billableDirty: boolean;
  internalRemarkVerr: string | null;
  zeroHoursReason: string | null;
};

export type BatchHoursLinePayload = {
  dayOfService: string;
  projectNumber: string;
  activity: string;
  memoText: string | null;
  hours: number;
  hoursBillable: number;
  contractId: number;
  contractPositionId: number | null;
  issueId: number | null;
  internalRemarkVerr: string | null;
  zeroHoursReason: string | null;
};

export type BatchHoursBlocker =
  | "project"
  | "contract"
  | "activity"
  | "hours"
  | "billable";

function formatHoursInput(n: number): string {
  return String(roundBookHours(n));
}

export function draftFromRow(row: BatchHoursRow): BatchHoursDraft {
  const d = row.defaults;
  return {
    projectNumber: d.projectNumber,
    projectLabel: d.projectLabel,
    contractId: d.contractId,
    contractVisible: d.contractVisible,
    contractPositionId: d.contractPositionId,
    contractOptional: d.contractOptional === true,
    activity: d.activity,
    memoText: d.memoText,
    hoursRaw: formatHoursInput(d.hours),
    hoursBillableRaw: formatHoursInput(d.hoursBillable),
    billableDirty: d.hours !== d.hoursBillable,
    internalRemarkVerr: null,
    zeroHoursReason: null,
  };
}

export function parseDraftHours(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 24) return null;
  return roundBookHours(n);
}

/** Typing in Geleistet carries over to Verrechenbar until that field is touched. */
export function setDraftHours(
  draft: BatchHoursDraft,
  hoursRaw: string
): BatchHoursDraft {
  return {
    ...draft,
    hoursRaw,
    hoursBillableRaw: draft.billableDirty ? draft.hoursBillableRaw : hoursRaw,
  };
}

export function setDraftBillable(
  draft: BatchHoursDraft,
  hoursBillableRaw: string
): BatchHoursDraft {
  return { ...draft, hoursBillableRaw, billableDirty: true };
}

export function isKnownInternalRemark(value: string | null): boolean {
  if (!value) return true;
  return TIMEKEEPING_INT_BEMERKUNG_OPTIONS.some((o) => o.value === value);
}

export function draftBlockers(draft: BatchHoursDraft): BatchHoursBlocker[] {
  const out: BatchHoursBlocker[] = [];
  if (!draft.projectNumber?.trim()) out.push("project");
  if (draft.contractId == null && !draft.contractOptional) out.push("contract");
  if (!draft.activity.trim()) out.push("activity");
  if (parseDraftHours(draft.hoursRaw) == null) out.push("hours");
  if (parseDraftHours(draft.hoursBillableRaw) == null) out.push("billable");
  return out;
}

export function draftToLinePayload(
  row: BatchHoursRow,
  draft: BatchHoursDraft
): BatchHoursLinePayload | null {
  if (draftBlockers(draft).length > 0) return null;
  const hours = parseDraftHours(draft.hoursRaw);
  const hoursBillable = parseDraftHours(draft.hoursBillableRaw);
  const projectNumber = draft.projectNumber?.trim();
  if (hours == null || hoursBillable == null || !projectNumber) return null;
  return {
    dayOfService: row.date,
    projectNumber,
    activity: draft.activity.trim().slice(0, 100),
    memoText: draft.memoText.trim().slice(0, 2000) || null,
    hours,
    hoursBillable,
    // 0 is Maringo's "kein Vertrag nötig".
    contractId: draft.contractId ?? 0,
    contractPositionId:
      draft.contractPositionId != null && draft.contractPositionId > 0
        ? draft.contractPositionId
        : null,
    issueId: row.defaults.issueId,
    internalRemarkVerr: draft.internalRemarkVerr?.trim() || null,
    zeroHoursReason: draft.zeroHoursReason?.trim() || null,
  };
}
