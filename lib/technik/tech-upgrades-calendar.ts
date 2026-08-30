/**
 * Shared tech-upgrade mailbox → read-only Technik calendar.
 * Events stay company events. Never written to user_day_status.
 */

import { getSetting, setSetting } from "@/lib/db/migrations";
import { graphJson } from "@/lib/microsoft/graph";
import { addDaysYmd, dayWindowLocal } from "@/lib/microsoft/time";
import { listOofSyncUserIds } from "@/lib/presence/oof-sync";
import { getAppUserById } from "@/lib/users/queries";
import { parseCalendarDateRange } from "@/lib/calendar/date-range";

export const COMPANY_TECH_UPGRADES_MAILBOX = "techupgrades@an-group.one";
export const COMPANY_TECH_UPGRADES_CALENDAR_SETTING =
  "company_tech_upgrades_calendar_json";

export type TechUpgradesCalendarConfig = {
  mailbox: string;
  readerUserId: number | null;
};

export type TechUpgradeEvent = {
  id: string;
  subject: string;
  customerName: string | null;
  start: string;
  end: string;
  date: string;
  isAllDay: boolean;
  systemsAffected: string[];
  mayAffectInternal: boolean;
  location: string | null;
  bodyPreview: string | null;
  webLink: string | null;
};

type GraphDateTime = {
  dateTime?: string | null;
  timeZone?: string | null;
};

type GraphTechEvent = {
  id?: string;
  subject?: string | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  location?: { displayName?: string | null };
  bodyPreview?: string | null;
  categories?: string[] | null;
  webLink?: string | null;
};

const SYSTEM_LABELS: Record<string, string> = {
  maringo: "Maringo",
  exchange: "Exchange",
  outlook: "Outlook",
  teams: "Teams",
  vpn: "VPN",
  firewall: "Firewall",
  entra: "Entra",
  "active directory": "Active Directory",
  sql: "SQL",
  backup: "Backup",
  sharepoint: "SharePoint",
  intune: "Intune",
  dns: "DNS",
  workbuddy: "WorkBuddy",
  erp: "ERP",
  sap: "SAP",
};

const SYSTEM_KEYS = Object.keys(SYSTEM_LABELS);

function normEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

export function normalizeTechUpgradesMailbox(
  raw: string | null | undefined
): string {
  const email = normEmail(raw);
  return email.includes("@") ? email : COMPANY_TECH_UPGRADES_MAILBOX;
}

export function inferCustomerName(
  subject: string,
  location?: string | null
): string | null {
  const loc = (location || "").trim();
  if (
    loc.length >= 2 &&
    !/\b(raum|room|saal|teams|zoom|online|meet)\b/i.test(loc)
  ) {
    return loc;
  }
  const trimmed = subject.trim();
  const labeled = trimmed.match(/\bkunde\s*[:\-–—]\s*(.+)$/i);
  if (labeled?.[1]?.trim()) return labeled[1].trim();
  const parts = trimmed.split(/\s+[–—]\s+|\s+-\s+/);
  if (parts.length >= 2) {
    const left = parts[0].trim();
    if (
      left.length >= 2 &&
      left.length <= 48 &&
      !/\b(upgrade|wartung|release|patch|update)\b/i.test(left)
    ) {
      return left;
    }
  }
  return null;
}

export function inferSystemsAffected(input: {
  subject: string;
  bodyPreview?: string | null;
  categories?: string[] | null;
  location?: string | null;
}): string[] {
  const fromCategories = (input.categories || [])
    .map((c) => c.trim())
    .filter(Boolean);
  const blob = [
    input.subject,
    input.bodyPreview || "",
    input.location || "",
    fromCategories.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();
  for (const cat of fromCategories) {
    const key = cat.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(SYSTEM_LABELS[key] ?? cat);
  }
  for (const key of SYSTEM_KEYS) {
    if (!blob.includes(key)) continue;
    const label = SYSTEM_LABELS[key] ?? key;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    found.push(label);
  }
  return found;
}

/** Subject token only — attendees and meeting type (Teams) never trigger. */
export function eventMayAffectInternal(subject: string): boolean {
  return /(?:^|[^\p{L}])intern(?:e|er|es|em|en)?(?=[^\p{L}]|$)/iu.test(
    subject
  );
}

export function readTechUpgradesCalendarConfig(): TechUpgradesCalendarConfig {
  const raw = getSetting(COMPANY_TECH_UPGRADES_CALENDAR_SETTING);
  if (!raw) {
    return { mailbox: COMPANY_TECH_UPGRADES_MAILBOX, readerUserId: null };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TechUpgradesCalendarConfig>;
    const reader =
      typeof parsed.readerUserId === "number" &&
      Number.isInteger(parsed.readerUserId) &&
      parsed.readerUserId > 0
        ? parsed.readerUserId
        : null;
    return {
      mailbox: normalizeTechUpgradesMailbox(parsed.mailbox),
      readerUserId: reader,
    };
  } catch {
    return { mailbox: COMPANY_TECH_UPGRADES_MAILBOX, readerUserId: null };
  }
}

export function techUpgradesCalendarPublic(): {
  mailbox: string;
  defaultMailbox: string;
  readerUserId: number | null;
  readerLabel: string | null;
} {
  const config = readTechUpgradesCalendarConfig();
  const reader = config.readerUserId
    ? getAppUserById(config.readerUserId)
    : null;
  return {
    mailbox: config.mailbox,
    defaultMailbox: COMPANY_TECH_UPGRADES_MAILBOX,
    readerUserId: config.readerUserId,
    readerLabel: reader?.display_name ?? null,
  };
}

export function writeTechUpgradesCalendarConfig(
  input: Partial<TechUpgradesCalendarConfig>
): TechUpgradesCalendarConfig {
  const prev = readTechUpgradesCalendarConfig();
  const next: TechUpgradesCalendarConfig = {
    mailbox: normalizeTechUpgradesMailbox(
      input.mailbox !== undefined ? input.mailbox : prev.mailbox
    ),
    readerUserId:
      input.readerUserId !== undefined ? input.readerUserId : prev.readerUserId,
  };
  setSetting(COMPANY_TECH_UPGRADES_CALENDAR_SETTING, JSON.stringify(next));
  return next;
}

export function mapTechUpgradeEvent(ev: GraphTechEvent): TechUpgradeEvent | null {
  const startRaw = (ev.start?.dateTime || "").trim();
  if (!startRaw) return null;
  const startYmd = startRaw.slice(0, 10);
  const endRaw = (ev.end?.dateTime || "").trim();
  const subject = (ev.subject || "").trim() || "Upgrade";
  const location = (ev.location?.displayName || "").trim() || null;
  const bodyPreview = (ev.bodyPreview || "").trim() || null;
  const systemsAffected = inferSystemsAffected({
    subject,
    bodyPreview,
    categories: ev.categories,
    location,
  });
  return {
    id: (ev.id || `${startRaw}:${subject}`).trim(),
    subject,
    customerName: inferCustomerName(subject, location),
    start: startRaw,
    end: endRaw || addDaysYmd(startYmd, 1) + "T00:00:00",
    date: startYmd,
    isAllDay: Boolean(ev.isAllDay),
    systemsAffected,
    mayAffectInternal: eventMayAffectInternal(subject),
    location,
    bodyPreview,
    webLink: (ev.webLink || "").trim() || null,
  };
}

const EVENT_SELECT =
  "id,subject,start,end,isAllDay,location,bodyPreview,categories,webLink";

async function listViaMailbox(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<TechUpgradeEvent[]> {
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: EVENT_SELECT,
    $orderby: "start/dateTime",
    $top: "250",
  });
  const data = await graphJson<{ value?: GraphTechEvent[] }>(
    readerUserId,
    `/users/${encodeURIComponent(mailbox)}/calendar/calendarView?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || [])
    .map(mapTechUpgradeEvent)
    .filter((e): e is TechUpgradeEvent => Boolean(e));
}

type GraphCalendarOwner = {
  id?: string;
  name?: string | null;
  owner?: { name?: string | null; address?: string | null };
};

async function listViaSharedCalendar(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<TechUpgradeEvent[]> {
  const listed = await graphJson<{ value?: GraphCalendarOwner[] }>(
    readerUserId,
    "/me/calendars?$top=100&$select=id,name,owner"
  );
  const want = normEmail(mailbox);
  const found = (listed.value || []).find((cal) => {
    const owner = normEmail(cal.owner?.address);
    const name = (cal.name || "").toLowerCase();
    return owner === want || name.includes("techupgrade");
  });
  if (!found?.id) throw new Error("Tech upgrades calendar not in mailbox list.");
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: EVENT_SELECT,
    $orderby: "start/dateTime",
    $top: "250",
  });
  const data = await graphJson<{ value?: GraphTechEvent[] }>(
    readerUserId,
    `/me/calendars/${encodeURIComponent(found.id)}/calendarView?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || [])
    .map(mapTechUpgradeEvent)
    .filter((e): e is TechUpgradeEvent => Boolean(e));
}

async function listForReader(
  readerUserId: number,
  mailbox: string,
  startYmd: string,
  endYmd: string
): Promise<TechUpgradeEvent[]> {
  try {
    return await listViaMailbox(readerUserId, mailbox, startYmd, endYmd);
  } catch {
    return listViaSharedCalendar(readerUserId, mailbox, startYmd, endYmd);
  }
}

export async function listTechUpgradeEvents(input: {
  from: string;
  to: string;
}): Promise<{
  events: TechUpgradeEvent[];
  mailbox: string;
  reason?: "no-reader" | "unreadable";
}> {
  const parsed = parseCalendarDateRange(input.from, input.to);
  if (!parsed.ok) {
    return {
      events: [],
      mailbox: readTechUpgradesCalendarConfig().mailbox,
      reason: "unreadable",
    };
  }
  const config = readTechUpgradesCalendarConfig();
  const readers = [config.readerUserId, ...listOofSyncUserIds()].filter(
    (id, i, all): id is number => id != null && all.indexOf(id) === i
  );
  if (readers.length === 0) {
    return { events: [], mailbox: config.mailbox, reason: "no-reader" };
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
        writeTechUpgradesCalendarConfig({ readerUserId });
      }
      return { events, mailbox: config.mailbox };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  console.warn("[technik] tech upgrades calendar", config.mailbox, lastError);
  return { events: [], mailbox: config.mailbox, reason: "unreadable" };
}
