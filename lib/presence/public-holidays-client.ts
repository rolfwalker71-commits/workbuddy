import type { PublicHolidayDay } from "@/lib/presence/public-holidays-shared";

export type PublicHolidaysFetch = {
  days: PublicHolidayDay[];
  reason: "no-reader" | "unreadable" | null;
};

export async function fetchPublicHolidays(
  from: string,
  to: string
): Promise<PublicHolidaysFetch> {
  try {
    const res = await fetch(
      `/api/holidays?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    if (!res.ok) return { days: [], reason: null };
    const json = (await res.json()) as {
      days?: PublicHolidayDay[];
      reason?: "no-reader" | "unreadable" | null;
    };
    return {
      days: Array.isArray(json.days) ? json.days : [],
      reason: json.reason ?? null,
    };
  } catch {
    return { days: [], reason: "unreadable" };
  }
}

export async function fetchPublicHolidayDays(
  from: string,
  to: string
): Promise<PublicHolidayDay[]> {
  return (await fetchPublicHolidays(from, to)).days;
}
