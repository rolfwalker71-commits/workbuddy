/** Client-safe public-holiday markers (no Node / Graph). */

export const PUBLIC_HOLIDAY_COUNTRIES = ["CH", "AT", "DE", "MX", "NP"] as const;

export type PublicHolidayCountry = (typeof PUBLIC_HOLIDAY_COUNTRIES)[number];

export type PublicHolidayEvent = {
  id: string;
  date: string;
  subject: string;
  countries: PublicHolidayCountry[];
};

export type PublicHolidayItem = {
  title: string;
  countries: PublicHolidayCountry[];
};

export type PublicHolidayDay = {
  date: string;
  countries: PublicHolidayCountry[];
  titles: string[];
  items: PublicHolidayItem[];
};

/** What Graph actually saw — shown on Team when the row stays empty. */
export type PublicHolidayProbe = {
  mailbox: string;
  calendars: string[];
  samples: string[];
  error: string | null;
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

/** Drop ISO country tokens so the visible name is "Weihnachten", not "Weihnachten CH". */
export function displayPublicHolidayTitle(subject: string): string {
  const raw = (subject || "").trim();
  if (!raw) return "";
  let text = raw;
  for (const code of PUBLIC_HOLIDAY_COUNTRIES) {
    text = text.replace(new RegExp(`(^|[^A-Za-z])${code}(?=[^A-Za-z]|$)`, "g"), "$1");
  }
  text = text.replace(/[\s,/|;·–—-]+/g, " ").trim();
  return text || raw;
}

export function groupPublicHolidaysByDay(
  events: readonly PublicHolidayEvent[]
): PublicHolidayDay[] {
  const byDate = new Map<
    string,
    {
      countries: Set<PublicHolidayCountry>;
      titles: string[];
      items: Map<string, Set<PublicHolidayCountry>>;
    }
  >();
  for (const event of events) {
    const date = (event.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let row = byDate.get(date);
    if (!row) {
      row = { countries: new Set(), titles: [], items: new Map() };
      byDate.set(date, row);
    }
    for (const country of event.countries) row.countries.add(country);
    const title = displayPublicHolidayTitle(event.subject);
    if (title && !row.titles.includes(title)) row.titles.push(title);
    if (title) {
      let item = row.items.get(title);
      if (!item) {
        item = new Set();
        row.items.set(title, item);
      }
      for (const country of event.countries) item.add(country);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      countries: PUBLIC_HOLIDAY_COUNTRIES.filter((c) => row.countries.has(c)),
      titles: row.titles,
      items: row.titles.map((title) => ({
        title,
        countries: PUBLIC_HOLIDAY_COUNTRIES.filter((c) =>
          (row.items.get(title) || new Set()).has(c)
        ),
      })),
    }));
}

export function isPublicHolidayCalendarHint(
  name: string | null | undefined
): boolean {
  const n = (name || "").toLowerCase();
  if (!n) return false;
  return (
    n.includes("public_holiday") ||
    n.includes("public holiday") ||
    n.includes("feiertag") ||
    n.includes("ww_public") ||
    n.includes("festivo") ||
    n.includes("feriado") ||
    n.includes("jour férié") ||
    n.includes("jour ferie") ||
    n.includes("giorno festivo") ||
    /\bholidays?\b/.test(n)
  );
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
