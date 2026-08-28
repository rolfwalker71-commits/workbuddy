import { sanitizeYmd } from "@/lib/mari/ttv";
import {
  parsePresenceStatus,
  type PresenceStatus,
} from "@/lib/presence/status";

export const PRESENCE_WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
] as const;

export type PresenceWeekdayKey = (typeof PRESENCE_WEEKDAY_KEYS)[number];

export type PresenceDefaultWeek = Partial<
  Record<PresenceWeekdayKey, PresenceStatus>
>;

const WEEKDAY_BY_UTC_DOW: Array<PresenceWeekdayKey | null> = [
  null,
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  null,
];

const WEEKDAY_KEY_SET = new Set<string>(PRESENCE_WEEKDAY_KEYS);

export function isPresenceWeekdayKey(raw: unknown): raw is PresenceWeekdayKey {
  return typeof raw === "string" && WEEKDAY_KEY_SET.has(raw);
}

export function weekdayKeyForYmd(ymd: string): PresenceWeekdayKey | null {
  const day = sanitizeYmd(ymd);
  if (!day) return null;
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return WEEKDAY_BY_UTC_DOW[dow] ?? null;
}

export function parsePresenceDefaultWeek(raw: unknown): PresenceDefaultWeek {
  let data: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      data = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const week: PresenceDefaultWeek = {};
  for (const key of PRESENCE_WEEKDAY_KEYS) {
    const status = parsePresenceStatus((data as Record<string, unknown>)[key]);
    if (status) week[key] = status;
  }
  return week;
}

export function serializePresenceDefaultWeek(week: PresenceDefaultWeek): string {
  const clean: PresenceDefaultWeek = {};
  for (const key of PRESENCE_WEEKDAY_KEYS) {
    const status = parsePresenceStatus(week[key]);
    if (status) clean[key] = status;
  }
  return JSON.stringify(clean);
}

export function defaultStatusForYmd(
  week: PresenceDefaultWeek,
  ymd: string
): PresenceStatus | null {
  const key = weekdayKeyForYmd(ymd);
  if (!key) return null;
  return week[key] ?? null;
}
