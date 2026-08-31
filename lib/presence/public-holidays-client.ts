import type { PublicHolidayDay } from "@/lib/presence/public-holidays-shared";

export async function fetchPublicHolidayDays(
  from: string,
  to: string
): Promise<PublicHolidayDay[]> {
  try {
    const res = await fetch(
      `/api/holidays?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { days?: PublicHolidayDay[] };
    return Array.isArray(json.days) ? json.days : [];
  } catch {
    return [];
  }
}
