/**
 * Company vacation mailbox → Team presence (Frei / Ferien).
 * Events are assigned to employees by attendee/organizer email.
 */

import { getSetting, setSetting } from "@/lib/db/migrations";
import { graphJson } from "@/lib/microsoft/graph";
import { getConnectedMicrosoftEmail } from "@/lib/microsoft/oauth";
import { addDaysYmd, dayWindowLocal, zurichYmd } from "@/lib/microsoft/time";
import {
  eventCoversYmd,
  listOofSyncUserIds,
} from "@/lib/presence/oof-sync";
import {
  deleteUserDayStatus,
  getUserDayStatus,
  upsertUserDayStatus,
} from "@/lib/presence/day-status";
import { vacationCalMustNotOverwrite } from "@/lib/presence/status";
import { getAppUserById, listActiveAppUsers } from "@/lib/users/queries";
import { sanitizeYmd } from "@/lib/mari/ttv";

export const COMPANY_VACATION_MAILBOX = "urlaubskalender@an-group.one";
export const COMPANY_VACATION_CALENDAR_SETTING =
  "company_vacation_calendar_json";

export type VacationCalendarConfig = {
  mailbox: string;
  readerUserId: number | null;
};

export type VacationCalendarEvent = {
  isAllDay: boolean;
  date: string;
  start: string;
  end: string;
  subject: string;
  assigneeEmails: string[];
};

type GraphDateTime = {
  dateTime?: string | null;
  timeZone?: string | null;
};

type GraphVacationEvent = {
  id?: string;
  subject?: string | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  organizer?: {
    emailAddress?: { address?: string | null };
  };
  attendees?: Array<{
    type?: string | null;
    emailAddress?: { address?: string | null };
  }>;
};

function normEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

export function normalizeVacationMailbox(
  raw: string | null | undefined
): string {
  const email = normEmail(raw);
  return email.includes("@") ? email : COMPANY_VACATION_MAILBOX;
}

export function readVacationCalendarConfig(): VacationCalendarConfig {
  const raw = getSetting(COMPANY_VACATION_CALENDAR_SETTING);
  if (!raw) {
    return { mailbox: COMPANY_VACATION_MAILBOX, readerUserId: null };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VacationCalendarConfig>;
    const reader =
      typeof parsed.readerUserId === "number" &&
      Number.isInteger(parsed.readerUserId) &&
      parsed.readerUserId > 0
        ? parsed.readerUserId
        : null;
    return {
      mailbox: normalizeVacationMailbox(parsed.mailbox),
      readerUserId: reader,
    };
  } catch {
    return { mailbox: COMPANY_VACATION_MAILBOX, readerUserId: null };
  }
}

export function vacationCalendarPublic(): {
  mailbox: string;
  defaultMailbox: string;
  readerUserId: number | null;
  readerLabel: string | null;
} {
  const config = readVacationCalendarConfig();
  const reader = config.readerUserId
    ? getAppUserById(config.readerUserId)
    : null;
  return {
    mailbox: config.mailbox,
    defaultMailbox: COMPANY_VACATION_MAILBOX,
    readerUserId: config.readerUserId,
    readerLabel: reader?.display_name ?? null,
  };
}

export function writeVacationCalendarConfig(
  input: Partial<VacationCalendarConfig>
): VacationCalendarConfig {
  const prev = readVacationCalendarConfig();
  const next: VacationCalendarConfig = {
    mailbox: normalizeVacationMailbox(
      input.mailbox !== undefined ? input.mailbox : prev.mailbox
    ),
    readerUserId:
      input.readerUserId !== undefined ? input.readerUserId : prev.readerUserId,
  };
  setSetting(COMPANY_VACATION_CALENDAR_SETTING, JSON.stringify(next));
  return next;
}

/**
 * Assigned person: attendees first (HR often organizes).
 * Organizer only when nobody is invited. Skip the mailbox itself.
 */
export function vacationEventAssigneeEmails(
  event: {
    organizerEmail?: string | null;
    attendeeEmails?: string[] | null;
  },
  mailbox: string
): string[] {
  const skip = new Set([normEmail(mailbox), COMPANY_VACATION_MAILBOX]);
  const attendees = (event.attendeeEmails || [])
    .map(normEmail)
    .filter((e) => e.includes("@") && !skip.has(e));
  if (attendees.length > 0) return [...new Set(attendees)];
  const organizer = normEmail(event.organizerEmail);
  if (organizer.includes("@") && !skip.has(organizer)) return [organizer];
  return [];
}

export function buildVacationUserIdByEmail(): Map<string, number> {
  const map = new Map<string, number>();
  for (const user of listActiveAppUsers()) {
    const login = normEmail(user.email);
    if (login.includes("@")) map.set(login, user.id);
    const ms = normEmail(getConnectedMicrosoftEmail(user.id));
    if (ms.includes("@")) map.set(ms, user.id);
  }
  return map;
}

export function userIdsOnVacationForDay(input: {
  ymd: string;
  mailbox: string;
  events: VacationCalendarEvent[];
  userIdByEmail: Map<string, number>;
}): Set<number> {
  const ids = new Set<number>();
  for (const event of input.events) {
    if (!event.isAllDay) continue;
    if (!eventCoversYmd(event, input.ymd)) continue;
    for (const email of event.assigneeEmails) {
      const userId = input.userIdByEmail.get(normEmail(email));
      if (userId != null) ids.add(userId);
    }
  }
  return ids;
}

export function applyVacationPresenceFromEvents(input: {
  ymd: string;
  mailbox: string;
  events: VacationCalendarEvent[];
  userIdByEmail?: Map<string, number>;
}): { applied: number; cleared: number; skipped: number } {
  const ymd = sanitizeYmd(input.ymd);
  if (!ymd) return { applied: 0, cleared: 0, skipped: 0 };
  const userIdByEmail = input.userIdByEmail ?? buildVacationUserIdByEmail();
  const onLeave = userIdsOnVacationForDay({
    ymd,
    mailbox: input.mailbox,
    events: input.events,
    userIdByEmail,
  });
  let applied = 0;
  let cleared = 0;
  let skipped = 0;
  for (const user of listActiveAppUsers()) {
    const existing = getUserDayStatus(user.id, ymd);
    if (onLeave.has(user.id)) {
      if (vacationCalMustNotOverwrite(existing)) {
        skipped += 1;
        continue;
      }
      upsertUserDayStatus({
        userId: user.id,
        ymd,
        status: "vacation",
        source: "vacationCal",
        setByUserId: user.id,
        note: input.mailbox,
      });
      applied += 1;
      continue;
    }
    if (existing?.source === "vacationCal") {
      deleteUserDayStatus(user.id, ymd);
      cleared += 1;
    }
  }
  return { applied, cleared, skipped };
}

function mapGraphVacationEvent(
  ev: GraphVacationEvent,
  mailbox: string
): VacationCalendarEvent | null {
  const startRaw = (ev.start?.dateTime || "").trim();
  if (!startRaw) return null;
  const startYmd = startRaw.slice(0, 10);
  const endRaw = (ev.end?.dateTime || "").trim();
  const attendeeEmails: string[] = [];
  for (const a of ev.attendees || []) {
    if ((a.type || "").toLowerCase() === "resource") continue;
    const email = normEmail(a.emailAddress?.address);
    if (email.includes("@")) attendeeEmails.push(email);
  }
  return {
    isAllDay: Boolean(ev.isAllDay),
    date: startYmd,
    start: startRaw,
    end: endRaw || addDaysYmd(startYmd, 1) + "T00:00:00",
    subject: (ev.subject || "").trim() || "Urlaub",
    assigneeEmails: vacationEventAssigneeEmails(
      {
        organizerEmail: ev.organizer?.emailAddress?.address,
        attendeeEmails,
      },
      mailbox
    ),
  };
}

async function listVacationEventsViaMailbox(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<VacationCalendarEvent[]> {
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: "id,subject,start,end,isAllDay,organizer,attendees",
    $orderby: "start/dateTime",
    $top: "250",
  });
  const data = await graphJson<{ value?: GraphVacationEvent[] }>(
    readerUserId,
    `/users/${encodeURIComponent(mailbox)}/calendar/calendarView?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || [])
    .map((ev) => mapGraphVacationEvent(ev, mailbox))
    .filter((e): e is VacationCalendarEvent => Boolean(e));
}

type GraphCalendarOwner = {
  id?: string;
  name?: string | null;
  owner?: { name?: string | null; address?: string | null };
};

async function listVacationEventsViaSharedCalendar(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<VacationCalendarEvent[]> {
  const listed = await graphJson<{ value?: GraphCalendarOwner[] }>(
    readerUserId,
    "/me/calendars?$top=100&$select=id,name,owner"
  );
  const want = normEmail(mailbox);
  const found = (listed.value || []).find((cal) => {
    const owner = normEmail(cal.owner?.address);
    const name = (cal.name || "").toLowerCase();
    return owner === want || name.includes("urlaubskalender");
  });
  if (!found?.id) throw new Error("Vacation calendar not in mailbox list.");
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: "id,subject,start,end,isAllDay,organizer,attendees",
    $orderby: "start/dateTime",
    $top: "250",
  });
  const data = await graphJson<{ value?: GraphVacationEvent[] }>(
    readerUserId,
    `/me/calendars/${encodeURIComponent(found.id)}/calendarView?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || [])
    .map((ev) => mapGraphVacationEvent(ev, mailbox))
    .filter((e): e is VacationCalendarEvent => Boolean(e));
}

async function listVacationEventsForReader(
  readerUserId: number,
  mailbox: string,
  ymd: string
): Promise<VacationCalendarEvent[]> {
  try {
    return await listVacationEventsViaMailbox(
      readerUserId,
      mailbox,
      ymd,
      ymd
    );
  } catch {
    return listVacationEventsViaSharedCalendar(
      readerUserId,
      mailbox,
      ymd,
      ymd
    );
  }
}

const lastSyncAt = new Map<string, number>();
const DEBOUNCE_MS = 60_000;

export function resetVacationCalSyncDebounceForTests(): void {
  lastSyncAt.clear();
}

export async function syncVacationCalendarPresence(
  ymd: string,
  options?: { force?: boolean }
): Promise<{
  attempted: boolean;
  applied: number;
  cleared: number;
  skipped: number;
  reason?: string;
}> {
  const day = sanitizeYmd(ymd);
  if (!day) {
    return { attempted: false, applied: 0, cleared: 0, skipped: 0, reason: "invalid" };
  }
  if (!options?.force) {
    const prev = lastSyncAt.get(day);
    if (prev != null && Date.now() - prev < DEBOUNCE_MS) {
      return {
        attempted: false,
        applied: 0,
        cleared: 0,
        skipped: 0,
        reason: "debounced",
      };
    }
  }
  const config = readVacationCalendarConfig();
  const readers = [
    config.readerUserId,
    ...listOofSyncUserIds(),
  ].filter((id, i, all): id is number => id != null && all.indexOf(id) === i);

  if (readers.length === 0) {
    return {
      attempted: false,
      applied: 0,
      cleared: 0,
      skipped: 0,
      reason: "no-reader",
    };
  }

  let lastError = "unreadable";
  for (const readerUserId of readers) {
    try {
      const events = await listVacationEventsForReader(
        readerUserId,
        config.mailbox,
        day
      );
      const result = applyVacationPresenceFromEvents({
        ymd: day,
        mailbox: config.mailbox,
        events,
      });
      if (config.readerUserId !== readerUserId) {
        writeVacationCalendarConfig({ readerUserId });
      }
      lastSyncAt.set(day, Date.now());
      return { attempted: true, ...result };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  console.warn("[presence] vacation calendar", config.mailbox, lastError);
  return {
    attempted: false,
    applied: 0,
    cleared: 0,
    skipped: 0,
    reason: "error",
  };
}

/** Scheduler: today from the shared company mailbox. */
export async function syncVacationCalendarIfDue(options?: {
  force?: boolean;
}): Promise<{
  attempted: boolean;
  applied: number;
  cleared: number;
  skipped: number;
  reason?: string;
}> {
  return syncVacationCalendarPresence(zurichYmd(), {
    force: options?.force ?? true,
  });
}
