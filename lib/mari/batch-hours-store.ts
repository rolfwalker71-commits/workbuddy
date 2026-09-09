/**
 * Draft persistence for the batch hours dialog: one JSON blob per user and
 * day in `settings`.
 *
 * Deliberately not on mari_calendar_stamps — `hours` and `memo` there mean
 * *booked* values and the day view renders an hours donut from them, so a
 * pending draft would look like a booking.
 */

import { getSetting, setSetting } from "@/lib/db/migrations";

/** Only the fields a user can change; the rest is re-derived on open. */
export type PersistedBatchDraft = {
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
  contractVisible: string | null;
  contractPositionId: number | null;
  activity: string;
  memoText: string;
  hoursRaw: string;
  hoursBillableRaw: string;
  billableDirty: boolean;
  internalRemarkVerr: string | null;
  zeroHoursReason: string | null;
};

export type PersistedBatchDay = Record<string, PersistedBatchDraft>;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function batchHoursDraftKey(userId: number, ymd: string): string {
  return `batch_hours_draft_u${userId}_${ymd}`;
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableStr(value: unknown, max: number): string | null {
  const s = str(value, max).trim();
  return s ? s : null;
}

function nullableInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Defensive: the blob is user data that may predate a field rename. */
export function parseBatchDraftDay(raw: string | null): PersistedBatchDay {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: PersistedBatchDay = {};
  for (const [eventId, value] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if (!eventId || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    out[eventId.slice(0, 400)] = {
      projectNumber: nullableStr(v.projectNumber, 40),
      projectLabel: nullableStr(v.projectLabel, 200),
      contractId: nullableInt(v.contractId),
      contractVisible: nullableStr(v.contractVisible, 40),
      contractPositionId: nullableInt(v.contractPositionId),
      activity: str(v.activity, 100),
      memoText: str(v.memoText, 2000),
      hoursRaw: str(v.hoursRaw, 12),
      hoursBillableRaw: str(v.hoursBillableRaw, 12),
      billableDirty: v.billableDirty === true,
      internalRemarkVerr: nullableStr(v.internalRemarkVerr, 40),
      zeroHoursReason: nullableStr(v.zeroHoursReason, 500),
    };
  }
  return out;
}

/** Drop rows that are gone from the day, so booked events do not linger. */
export function pruneBatchDraftDay(
  day: PersistedBatchDay,
  keepEventIds: readonly string[]
): PersistedBatchDay {
  const keep = new Set(keepEventIds);
  const out: PersistedBatchDay = {};
  for (const [eventId, draft] of Object.entries(day)) {
    if (keep.has(eventId)) out[eventId] = draft;
  }
  return out;
}

export function isValidBatchDraftYmd(ymd: string): boolean {
  return YMD_RE.test(ymd);
}

export function readBatchDraftDay(
  userId: number,
  ymd: string
): PersistedBatchDay {
  if (!isValidBatchDraftYmd(ymd)) return {};
  return parseBatchDraftDay(getSetting(batchHoursDraftKey(userId, ymd)));
}

export function writeBatchDraftDay(
  userId: number,
  ymd: string,
  day: PersistedBatchDay
): void {
  if (!isValidBatchDraftYmd(ymd)) return;
  const key = batchHoursDraftKey(userId, ymd);
  if (Object.keys(day).length === 0) {
    setSetting(key, null);
    return;
  }
  setSetting(key, JSON.stringify(day));
}
