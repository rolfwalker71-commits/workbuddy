/**
 * Shared public-holiday mailbox → Team + Home markers.
 * Events stay company-wide. Never written to user_day_status.
 */

import { getSetting, setSetting } from "@/lib/db/migrations";
import { graphJson, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { addDaysYmd, dayWindowLocal } from "@/lib/microsoft/time";
import { listOofSyncUserIds } from "@/lib/presence/oof-sync";
import { getAppUserById } from "@/lib/users/queries";
import { parseCalendarDateRange } from "@/lib/calendar/date-range";
import {
  groupPublicHolidaysByDay,
  isPublicHolidayCalendarHint,
  parsePublicHolidayCountries,
  type PublicHolidayDay,
  type PublicHolidayEvent,
  type PublicHolidayProbe,
} from "@/lib/presence/public-holidays-shared";

export const COMPANY_PUBLIC_HOLIDAYS_MAILBOX = "ww_public_holidays@an-group.one";
export const COMPANY_PUBLIC_HOLIDAYS_CALENDAR_SETTING =
  "company_public_holidays_calendar_json";

export type PublicHolidaysCalendarConfig = {
  mailbox: string;
  readerUserId: number | null;
};

type GraphDateTime = {
  dateTime?: string | null;
  timeZone?: string | null;
};

type GraphHolidayEvent = {
  id?: string;
  subject?: string | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  categories?: string[] | null;
  location?: { displayName?: string | null } | null;
};

function normEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

export function normalizePublicHolidaysMailbox(
  raw: string | null | undefined
): string {
  const email = normEmail(raw);
  return email.includes("@") ? email : COMPANY_PUBLIC_HOLIDAYS_MAILBOX;
}

export function readPublicHolidaysCalendarConfig(): PublicHolidaysCalendarConfig {
  const raw = getSetting(COMPANY_PUBLIC_HOLIDAYS_CALENDAR_SETTING);
  if (!raw) {
    return { mailbox: COMPANY_PUBLIC_HOLIDAYS_MAILBOX, readerUserId: null };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PublicHolidaysCalendarConfig>;
    const reader =
      typeof parsed.readerUserId === "number" &&
      Number.isInteger(parsed.readerUserId) &&
      parsed.readerUserId > 0
        ? parsed.readerUserId
        : null;
    return {
      mailbox: normalizePublicHolidaysMailbox(parsed.mailbox),
      readerUserId: reader,
    };
  } catch {
    return { mailbox: COMPANY_PUBLIC_HOLIDAYS_MAILBOX, readerUserId: null };
  }
}

export function publicHolidaysCalendarPublic(): {
  mailbox: string;
  defaultMailbox: string;
  readerUserId: number | null;
  readerLabel: string | null;
} {
  const config = readPublicHolidaysCalendarConfig();
  const reader = config.readerUserId
    ? getAppUserById(config.readerUserId)
    : null;
  return {
    mailbox: config.mailbox,
    defaultMailbox: COMPANY_PUBLIC_HOLIDAYS_MAILBOX,
    readerUserId: config.readerUserId,
    readerLabel: reader?.display_name ?? null,
  };
}

export function writePublicHolidaysCalendarConfig(
  input: Partial<PublicHolidaysCalendarConfig>
): PublicHolidaysCalendarConfig {
  const prev = readPublicHolidaysCalendarConfig();
  const next: PublicHolidaysCalendarConfig = {
    mailbox: normalizePublicHolidaysMailbox(
      input.mailbox !== undefined ? input.mailbox : prev.mailbox
    ),
    readerUserId:
      input.readerUserId !== undefined ? input.readerUserId : prev.readerUserId,
  };
  setSetting(COMPANY_PUBLIC_HOLIDAYS_CALENDAR_SETTING, JSON.stringify(next));
  return next;
}

function datesCovered(
  startYmd: string,
  endRaw: string,
  isAllDay: boolean
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) return [];
  if (!isAllDay) return [startYmd];
  let endExclusive = endRaw.slice(0, 10);
  if (!endExclusive || endExclusive <= startYmd) {
    endExclusive = addDaysYmd(startYmd, 1);
  }
  const out: string[] = [];
  let cursor = startYmd;
  while (cursor < endExclusive && out.length < 21) {
    out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

export function mapPublicHolidayEvents(
  ev: GraphHolidayEvent,
  calendarName?: string | null
): PublicHolidayEvent[] {
  const startRaw = (ev.start?.dateTime || "").trim();
  const startYmd = startRaw.slice(0, 10);
  if (!startYmd) return [];
  const subject = (ev.subject || "").trim() || "Feiertag";
  const location = (ev.location?.displayName || "").trim();
  const blob = [subject, calendarName, location, ...(ev.categories || [])].join(
    " "
  );
  const countries = parsePublicHolidayCountries(blob);
  const dates = datesCovered(startYmd, (ev.end?.dateTime || "").trim(), Boolean(ev.isAllDay));
  const idBase = (ev.id || `${startRaw}:${subject}`).trim();
  return dates.map((date) => ({
    id: `${idBase}:${date}`,
    date,
    subject,
    countries,
  }));
}

const EVENT_SELECT = "id,subject,start,end,isAllDay,categories,location";
/** Shared / LimitedDetails calendars reject categories and often $orderby. */
const EVENT_SELECT_LIMITED = "id,subject,start,end,isAllDay,location";

type GraphCalendarOwner = {
  id?: string;
  name?: string | null;
  owner?: { name?: string | null; address?: string | null };
};

export function isHolidaySourceCalendar(
  cal: { name?: string | null; owner?: { address?: string | null } },
  mailbox: string
): boolean {
  const owner = normEmail(cal.owner?.address);
  return owner === normEmail(mailbox) || isPublicHolidayCalendarHint(cal.name);
}

/** Prefer «Public Holiday» by name. Do not pick the empty default just because the owner matches. */
export function holidayCalendarsToRead(
  listed: readonly GraphCalendarOwner[],
  mailbox: string
): GraphCalendarOwner[] {
  const named = listed.filter(
    (cal) => cal.id && isPublicHolidayCalendarHint(cal.name)
  );
  if (named.length > 0) return named;
  return listed.filter(
    (cal) => cal.id && normEmail(cal.owner?.address) === normEmail(mailbox)
  );
}

function dedupeHolidayEvents(events: PublicHolidayEvent[]): PublicHolidayEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

async function calendarViewWithSelect(
  readerUserId: number,
  path: string,
  startYmd: string,
  endYmd: string,
  select: string,
  calendarName: string | null | undefined,
  orderBy: boolean
): Promise<PublicHolidayEvent[]> {
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: select,
    $top: "250",
  });
  if (orderBy) qs.set("$orderby", "start/dateTime");
  const data = await graphJson<{ value?: GraphHolidayEvent[] }>(
    readerUserId,
    `${path}?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || []).flatMap((ev) =>
    mapPublicHolidayEvents(ev, calendarName)
  );
}

async function calendarViewOn(
  readerUserId: number,
  path: string,
  startYmd: string,
  endYmd: string,
  calendarName?: string | null
): Promise<PublicHolidayEvent[]> {
  try {
    return await calendarViewWithSelect(
      readerUserId,
      path,
      startYmd,
      endYmd,
      EVENT_SELECT,
      calendarName,
      true
    );
  } catch (error) {
    if (!(error instanceof MicrosoftGraphError)) throw error;
    if (error.status !== 400 && error.status !== 403) throw error;
    return calendarViewWithSelect(
      readerUserId,
      path,
      startYmd,
      endYmd,
      EVENT_SELECT_LIMITED,
      calendarName,
      false
    );
  }
}

async function listCalendars(
  readerUserId: number,
  path: string
): Promise<GraphCalendarOwner[]> {
  try {
    const data = await graphJson<{ value?: GraphCalendarOwner[] }>(
      readerUserId,
      path
    );
    return data.value || [];
  } catch {
    return [];
  }
}

async function listCalendarsWithGroups(
  readerUserId: number,
  root: "/me" | `/users/${string}`
): Promise<GraphCalendarOwner[]> {
  const byId = new Map<string, GraphCalendarOwner>();
  const add = (rows: GraphCalendarOwner[]) => {
    for (const cal of rows) {
      if (cal.id && !byId.has(cal.id)) byId.set(cal.id, cal);
    }
  };
  add(await listCalendars(readerUserId, `${root}/calendars?$top=100&$select=id,name,owner`));
  const groups = await listCalendars(
    readerUserId,
    `${root}/calendarGroups?$top=40&$select=id,name`
  );
  const nested = await Promise.all(
    groups
      .filter((group) => group.id)
      .map((group) =>
        listCalendars(
          readerUserId,
          `${root}/calendarGroups/${encodeURIComponent(group.id!)}/calendars?$top=80&$select=id,name,owner`
        )
      )
  );
  add(nested.flat());
  return [...byId.values()];
}

async function readHolidayCalendars(
  readerUserId: number,
  calendars: GraphCalendarOwner[],
  viewRoot: "/me" | `/users/${string}`,
  startYmd: string,
  endYmd: string
): Promise<PublicHolidayEvent[]> {
  const chunks = await Promise.all(
    calendars.map(async (cal) => {
      try {
        return await calendarViewOn(
          readerUserId,
          `${viewRoot}/calendars/${encodeURIComponent(cal.id!)}/calendarView`,
          startYmd,
          endYmd,
          cal.name
        );
      } catch {
        return [];
      }
    })
  );
  return chunks.flat();
}

function calendarNamesOf(rows: GraphCalendarOwner[]): string[] {
  const names: string[] = [];
  for (const cal of rows) {
    const name = (cal.name || "").trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function eventSamples(events: PublicHolidayEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    const line = `${event.date} ${event.subject}`.trim();
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= 12) break;
  }
  return out;
}

async function listForReader(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<{ events: PublicHolidayEvent[]; calendars: string[] }> {
  const encoded = encodeURIComponent(mailbox);
  const mailboxRoot: `/users/${string}` = `/users/${encoded}`;
  const collected: PublicHolidayEvent[] = [];
  const names: string[] = [];
  try {
    collected.push(
      ...(await calendarViewOn(
        readerUserId,
        `${mailboxRoot}/calendar/calendarView`,
        startYmd,
        endYmd
      ))
    );
  } catch {
    /* named Public Holiday below */
  }

  const mailboxListed = await listCalendarsWithGroups(readerUserId, mailboxRoot);
  names.push(...calendarNamesOf(mailboxListed));
  collected.push(
    ...(await readHolidayCalendars(
      readerUserId,
      holidayCalendarsToRead(mailboxListed, mailbox),
      mailboxRoot,
      startYmd,
      endYmd
    ))
  );

  const mineListed = await listCalendarsWithGroups(readerUserId, "/me");
  names.push(...calendarNamesOf(mineListed));
  const mine = holidayCalendarsToRead(mineListed, mailbox);
  if (collected.length === 0 && mine.length === 0) {
    throw new Error(
      `Public Holiday nicht in der Kalenderliste (${names.join(", ") || "leer"}).`
    );
  }
  if (collected.length === 0 && mine.length > 0) {
    collected.push(
      ...(await readHolidayCalendars(
        readerUserId,
        mine,
        "/me",
        startYmd,
        endYmd
      ))
    );
  }

  return {
    events: dedupeHolidayEvents(collected),
    calendars: [...new Set(names)],
  };
}

export async function listPublicHolidayDays(input: {
  from: string;
  to: string;
}): Promise<{
  days: PublicHolidayDay[];
  mailbox: string;
  reason?: "no-reader" | "unreadable";
  probe: PublicHolidayProbe;
}> {
  const emptyProbe = (error: string | null): PublicHolidayProbe => ({
    mailbox: readPublicHolidaysCalendarConfig().mailbox,
    calendars: [],
    samples: [],
    error,
  });
  const parsed = parseCalendarDateRange(input.from, input.to);
  if (!parsed.ok) {
    return {
      days: [],
      mailbox: readPublicHolidaysCalendarConfig().mailbox,
      reason: "unreadable",
      probe: emptyProbe(parsed.error),
    };
  }
  const config = readPublicHolidaysCalendarConfig();
  const readers = [config.readerUserId, ...listOofSyncUserIds()].filter(
    (id, i, all): id is number => id != null && all.indexOf(id) === i
  );
  if (readers.length === 0) {
    return {
      days: [],
      mailbox: config.mailbox,
      reason: "no-reader",
      probe: {
        mailbox: config.mailbox,
        calendars: [],
        samples: [],
        error: "no-reader",
      },
    };
  }
  let lastError = "unreadable";
  let lastCalendars: string[] = [];
  for (const readerUserId of readers) {
    try {
      const { events, calendars } = await listForReader(
        readerUserId,
        config.mailbox,
        parsed.range.from,
        parsed.range.to
      );
      lastCalendars = calendars;
      if (config.readerUserId !== readerUserId) {
        writePublicHolidaysCalendarConfig({ readerUserId });
      }
      return {
        days: groupPublicHolidaysByDay(events),
        mailbox: config.mailbox,
        probe: {
          mailbox: config.mailbox,
          calendars,
          samples: eventSamples(events),
          error: events.length === 0 ? "calendarView leer" : null,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  console.warn("[holidays] public holidays calendar", config.mailbox, lastError);
  return {
    days: [],
    mailbox: config.mailbox,
    reason: "unreadable",
    probe: {
      mailbox: config.mailbox,
      calendars: lastCalendars,
      samples: [],
      error: lastError,
    },
  };
}
