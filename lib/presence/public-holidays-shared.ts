/** Client-safe public-holiday markers (no Node / Graph). */

export const PUBLIC_HOLIDAY_COUNTRIES = ["CH", "AT", "DE", "MX", "NP"] as const;

export type PublicHolidayCountry = (typeof PUBLIC_HOLIDAY_COUNTRIES)[number];

export type PublicHolidayEvent = {
  id: string;
  date: string;
  subject: string;
  countries: PublicHolidayCountry[];
};

export type PublicHolidayDay = {
  date: string;
  countries: PublicHolidayCountry[];
  titles: string[];
};

const COUNTRY_ALIASES: Array<{
  code: PublicHolidayCountry;
  needles: string[];
}> = [
  {
    code: "CH",
    needles: ["switzerland", "schweiz", "suisse", "svizzera", "swiss"],
  },
  {
    code: "AT",
    needles: ["austria", "österreich", "oesterreich", "osterreich"],
  },
  {
    code: "DE",
    needles: ["germany", "deutschland", "german"],
  },
  {
    code: "MX",
    needles: ["mexico", "mexiko", "mexican", "mexikan"],
  },
  {
    code: "NP",
    needles: ["nepal", "nepalese", "nepali"],
  },
];

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function parsePublicHolidayCountries(
  raw: string | null | undefined
): PublicHolidayCountry[] {
  const text = (raw || "").trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Set<PublicHolidayCountry>();
  for (const code of PUBLIC_HOLIDAY_COUNTRIES) {
    const re = new RegExp(`(?:^|[^A-Za-z])${code}(?:[^A-Za-z]|$)`);
    if (re.test(text)) found.add(code);
  }
  for (const row of COUNTRY_ALIASES) {
    if (row.needles.some((n) => lower.includes(n))) found.add(row.code);
  }
  return PUBLIC_HOLIDAY_COUNTRIES.filter((c) => found.has(c));
}

export function formatPublicHolidayCountries(
  countries: readonly PublicHolidayCountry[]
): string {
  return countries.join(" · ");
}

export function groupPublicHolidaysByDay(
  events: readonly PublicHolidayEvent[]
): PublicHolidayDay[] {
  const byDate = new Map<string, { countries: Set<PublicHolidayCountry>; titles: string[] }>();
  for (const event of events) {
    const date = (event.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let row = byDate.get(date);
    if (!row) {
      row = { countries: new Set(), titles: [] };
      byDate.set(date, row);
    }
    for (const country of event.countries) row.countries.add(country);
    const title = event.subject.trim();
    if (title && !row.titles.includes(title)) row.titles.push(title);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      countries: PUBLIC_HOLIDAY_COUNTRIES.filter((c) => row.countries.has(c)),
      titles: row.titles,
    }))
    .filter((row) => row.countries.length > 0);
}

/** 14 days ahead; in December keep looking through 2 January. */
export function publicHolidayLookaheadRange(todayYmd: string): {
  from: string;
  to: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayYmd)) {
    return { from: todayYmd, to: todayYmd };
  }
  const month = Number(todayYmd.slice(5, 7));
  if (month === 12) {
    const year = Number(todayYmd.slice(0, 4));
    return { from: todayYmd, to: `${year + 1}-01-02` };
  }
  return { from: todayYmd, to: addDaysYmd(todayYmd, 14) };
}

export function publicHolidayDayOn(
  days: readonly PublicHolidayDay[],
  ymd: string
): PublicHolidayDay | null {
  return days.find((d) => d.date === ymd) ?? null;
}
