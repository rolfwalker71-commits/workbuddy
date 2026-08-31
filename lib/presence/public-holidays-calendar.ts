/**
 * Shared public-holiday mailbox → Team + Home markers.
 * Events stay company-wide. Never written to user_day_status.
 */

import { getSetting, setSetting } from "@/lib/db/migrations";
import { graphJson } from "@/lib/microsoft/graph";
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

type GraphCalendarOwner = {
  id?: string;
  name?: string | null;
  owner?: { name?: string | null; address?: string | null };
};

async function listViaMailbox(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<PublicHolidayEvent[]> {
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: EVENT_SELECT,
    $orderby: "start/dateTime",
    $top: "250",
  });
  const data = await graphJson<{ value?: GraphHolidayEvent[] }>(
    readerUserId,
    `/users/${encodeURIComponent(mailbox)}/calendar/calendarView?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || []).flatMap((ev) => mapPublicHolidayEvents(ev));
}

async function listViaSharedCalendar(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<PublicHolidayEvent[]> {
  const listed = await graphJson<{ value?: GraphCalendarOwner[] }>(
    readerUserId,
    "/me/calendars?$top=100&$select=id,name,owner"
  );
  const want = normEmail(mailbox);
  const found = (listed.value || []).find((cal) => {
    const owner = normEmail(cal.owner?.address);
    return owner === want || isPublicHolidayCalendarHint(cal.name);
  });
  if (!found?.id) throw new Error("Public holidays calendar not in mailbox list.");
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: EVENT_SELECT,
    $orderby: "start/dateTime",
    $top: "250",
  });
  const data = await graphJson<{ value?: GraphHolidayEvent[] }>(
    readerUserId,
    `/me/calendars/${encodeURIComponent(found.id)}/calendarView?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || []).flatMap((ev) =>
    mapPublicHolidayEvents(ev, found.name)
  );
}

async function listForReader(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<PublicHolidayEvent[]> {
  try {
    return await listViaMailbox(readerUserId, mailbox, startYmd, endYmd);
  } catch {
    return listViaSharedCalendar(readerUserId, mailbox, startYmd, endYmd);
  }
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
  const readers = [config.readerUserId, ...listOofSyncUserIds()].filter(
    (id, i, all): id is number => id != null && all.indexOf(id) === i
  );
  if (readers.length === 0) {
    return { days: [], mailbox: config.mailbox, reason: "no-reader" };
  }
  let lastError = "unreadable";
  for (const readerUserId of readers) {
    try {
      const events = await listForReader(
        readerUserId,
        config.mailbox,
        parsed.range.from,
        parsed.range.to
      );
      if (config.readerUserId !== readerUserId) {
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
  console.warn("[holidays] public holidays calendar", config.mailbox, lastError);
  return { days: [], mailbox: config.mailbox, reason: "unreadable" };
}
