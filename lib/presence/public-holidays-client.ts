import type {
  PublicHolidayDay,
  PublicHolidayProbe,
} from "@/lib/presence/public-holidays-shared";

export type PublicHolidaysFetch = {
  days: PublicHolidayDay[];
  reason: "no-reader" | "unreadable" | null;
  probe: PublicHolidayProbe | null;
};

const EMPTY_FETCH: PublicHolidaysFetch = {
  days: [],
  reason: null,
  probe: null,
};

export async function fetchPublicHolidays(
  from: string,
  to: string
): Promise<PublicHolidaysFetch> {
  try {
    const res = await fetch(
      `/api/holidays?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    if (!res.ok) {
      return { days: [], reason: "unreadable", probe: null };
    }
    const json = (await res.json()) as {
      days?: PublicHolidayDay[];
      reason?: "no-reader" | "unreadable" | null;
      probe?: PublicHolidayProbe | null;
    };
    return {
      days: Array.isArray(json.days) ? json.days : [],
      reason: json.reason ?? null,
      probe: json.probe ?? null,
    };
  } catch {
    return { ...EMPTY_FETCH, reason: "unreadable" };
  }
}

export async function fetchPublicHolidayDays(
  from: string,
  to: string
): Promise<PublicHolidayDay[]> {
  return (await fetchPublicHolidays(from, to)).days;
}
