/**
 * Shared public-holiday mailbox → Team + Home markers.
 * Events stay company-wide. Never written to user_day_status.
 */

import { getSetting, setSetting } from "@/lib/db/migrations";
import { graphJson, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { addDaysYmd } from "@/lib/microsoft/time";
import { listOofSyncUserIds } from "@/lib/presence/oof-sync";
import { readVacationCalendarConfig } from "@/lib/presence/vacation-calendar";
import { readTechUpgradesCalendarConfig } from "@/lib/technik/tech-upgrades-calendar";
import { getAppUserById } from "@/lib/users/queries";
import { parseCalendarDateRange } from "@/lib/calendar/date-range";
import {
  groupPublicHolidaysByDay,
  isPublicHolidayCalendarHint,
  parsePublicHolidayCountries,
  type PublicHolidayDay,
  type PublicHolidayEvent,
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

/** Inclusive start, exclusive end at next midnight — Graph calendarView overlap. */
export function calendarViewWindow(
  startYmd: string,
  endYmd: string
): { start: string; end: string } {
  return {
    start: `${startYmd}T00:00:00`,
    end: `${addDaysYmd(endYmd, 1)}T00:00:00`,
  };
}

export function isSharedHolidayCalendar(
  cal: { name?: string | null; owner?: { address?: string | null } },
  mailbox: string
): boolean {
  const owner = normEmail(cal.owner?.address);
  const name = cal.name || "";
  return (
    owner === normEmail(mailbox) ||
    isPublicHolidayCalendarHint(name) ||
    parsePublicHolidayCountries(name).length > 0
  );
}

export function shouldPersistHolidayReader(eventCount: number): boolean {
  return eventCount > 0;
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
/** Outlook «Titel und Orte» / LimitedDetails rejects categories. */
const EVENT_SELECT_LIMITED = "id,subject,start,end,isAllDay,location";

type GraphCalendarOwner = {
  id?: string;
  name?: string | null;
  owner?: { name?: string | null; address?: string | null };
};

async function calendarViewWithSelect(
  readerUserId: number,
  path: string,
  startYmd: string,
  endYmd: string,
  select: string,
  calendarName?: string | null,
  orderBy = true
): Promise<PublicHolidayEvent[]> {
  const { start, end } = calendarViewWindow(startYmd, endYmd);
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

async function calendarViewEvents(
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
      calendarName
    );
  } catch (error) {
    if (!(error instanceof MicrosoftGraphError)) throw error;
    if (error.status === 403) {
      return calendarViewWithSelect(
        readerUserId,
        path,
        startYmd,
        endYmd,
        EVENT_SELECT_LIMITED,
        calendarName
      );
    }
    if (error.status === 400) {
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
    throw error;
  }
}

async function graphPages<T>(
  readerUserId: number,
  path: string
): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  for (let page = 0; page < 8 && next; page++) {
    const data = await graphJson<{
      value?: T[];
      "@odata.nextLink"?: string;
    }>(readerUserId, next);
    out.push(...(data.value || []));
    next = data["@odata.nextLink"] || null;
  }
  return out;
}

async function listMailboxCalendarRefs(
  readerUserId: number,
  mailbox: string
): Promise<GraphCalendarOwner[]> {
  const encoded = encodeURIComponent(mailbox);
  const byId = new Map<string, GraphCalendarOwner>();
  const add = (rows: GraphCalendarOwner[]) => {
    for (const cal of rows) {
      if (cal.id && !byId.has(cal.id)) byId.set(cal.id, cal);
    }
  };
  try {
    add(
      await graphPages<GraphCalendarOwner>(
        readerUserId,
        `/users/${encoded}/calendars?$top=80&$select=id,name`
      )
    );
  } catch {
    /* calendar groups below */
  }
  try {
    const groups = await graphPages<GraphCalendarOwner>(
      readerUserId,
      `/users/${encoded}/calendarGroups?$top=40&$select=id,name`
    );
    const nested = await Promise.all(
      groups
        .filter((group) => group.id)
        .map((group) =>
          graphPages<GraphCalendarOwner>(
            readerUserId,
            `/users/${encoded}/calendarGroups/${encodeURIComponent(group.id!)}/calendars?$top=80&$select=id,name`
          ).catch(() => [])
        )
    );
    add(nested.flat());
  } catch {
    /* optional */
  }
  return [...byId.values()];
}

function dedupeHolidayEvents(
  events: PublicHolidayEvent[]
): PublicHolidayEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

async function listViaMailbox(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<PublicHolidayEvent[]> {
  const encoded = encodeURIComponent(mailbox);
  const collected: PublicHolidayEvent[] = [];
  try {
    const fromDefault = await calendarViewEvents(
      readerUserId,
      `/users/${encoded}/calendar/calendarView`,
      startYmd,
      endYmd
    );
    collected.push(...fromDefault);
  } catch {
    /* listing other calendars below */
  }
  const calendars = await listMailboxCalendarRefs(readerUserId, mailbox);
  const chunks = await Promise.all(
    calendars.map(async (cal) => {
      try {
        return await calendarViewEvents(
          readerUserId,
          `/users/${encoded}/calendars/${encodeURIComponent(cal.id!)}/calendarView`,
          startYmd,
          endYmd,
          cal.name
        );
      } catch {
        return [];
      }
    })
  );
  collected.push(...chunks.flat());
  return dedupeHolidayEvents(collected);
}

async function listViaSharedCalendar(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<PublicHolidayEvent[]> {
  const listed = await graphPages<GraphCalendarOwner>(
    readerUserId,
    "/me/calendars?$top=100&$select=id,name,owner"
  );
  const found = listed.filter(
    (cal) => Boolean(cal.id) && isSharedHolidayCalendar(cal, mailbox)
  );
  if (found.length === 0) return [];
  const chunks = await Promise.all(
    found.map((cal) =>
      calendarViewEvents(
        readerUserId,
        `/me/calendars/${encodeURIComponent(cal.id!)}/calendarView`,
        startYmd,
        endYmd,
        cal.name
      )
    )
  );
  return dedupeHolidayEvents(chunks.flat());
}

async function listForReader(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<PublicHolidayEvent[]> {
  let mailboxEvents: PublicHolidayEvent[] | null = null;
  try {
    mailboxEvents = await listViaMailbox(readerUserId, mailbox, startYmd, endYmd);
  } catch {
    mailboxEvents = null;
  }
  if (mailboxEvents && mailboxEvents.length > 0) return mailboxEvents;
  try {
    const shared = await listViaSharedCalendar(
      readerUserId,
      mailbox,
      startYmd,
      endYmd
    );
    if (shared.length > 0) return shared;
  } catch (error) {
    if (!mailboxEvents) throw error;
  }
  return mailboxEvents || [];
}

function listHolidayReaderIds(preferred: number | null): number[] {
  const extras = [
    preferred,
    readVacationCalendarConfig().readerUserId,
    readTechUpgradesCalendarConfig().readerUserId,
    ...listOofSyncUserIds(),
  ];
  return extras.filter(
    (id, i, all): id is number => id != null && all.indexOf(id) === i
  );
}

export async function listPublicHolidayDays(input: {
  from: string;
  to: string;
}): Promise<{
  days: PublicHolidayDay[];
  mailbox: string;
  reason?: "no-reader" | "unreadable";
}> {
  const parsed = parseCalendarDateRange(input.from, input.to);
  if (!parsed.ok) {
    return {
      days: [],
      mailbox: readPublicHolidaysCalendarConfig().mailbox,
      reason: "unreadable",
    };
  }
  const config = readPublicHolidaysCalendarConfig();
  const readers = listHolidayReaderIds(config.readerUserId);
  if (readers.length === 0) {
    return { days: [], mailbox: config.mailbox, reason: "no-reader" };
  }
  let lastError = "unreadable";
  let sawReadable = false;
  for (const readerUserId of readers) {
    try {
      const events = await listForReader(
        readerUserId,
        config.mailbox,
        parsed.range.from,
        parsed.range.to
      );
      sawReadable = true;
      if (events.length === 0) continue;
      if (
        shouldPersistHolidayReader(events.length) &&
        config.readerUserId !== readerUserId
      ) {
        writePublicHolidaysCalendarConfig({ readerUserId });
      }
      return {
        days: groupPublicHolidaysByDay(events),
        mailbox: config.mailbox,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (sawReadable) {
    return { days: [], mailbox: config.mailbox };
  }
  console.warn("[holidays] public holidays calendar", config.mailbox, lastError);
  return { days: [], mailbox: config.mailbox, reason: "unreadable" };
}
