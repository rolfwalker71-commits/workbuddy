import { sanitizeYmd } from "@/lib/mari/ttv";
import {
  listMicrosoftEventsInRange,
  type MsCalendarEvent,
} from "@/lib/microsoft/calendar-review";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";
import {
  deleteUserDayStatus,
  getUserDayStatus,
  upsertUserDayStatus,
} from "@/lib/presence/day-status";
import { oofMustNotOverwrite } from "@/lib/presence/status";
import { listActiveUsersWithModule } from "@/lib/users/queries";

const OOF_SHOW_AS = new Set(["oof", "away"]);

export type OofSyncAction = "applied" | "cleared" | "skipped" | "unchanged";

export type OofSyncResult = {
  action: OofSyncAction;
  reason?: string;
};

export type OutlookAbsenceEvent = Pick<
  MsCalendarEvent,
  "isAllDay" | "showAs" | "subject" | "date" | "start" | "end"
>;

/** Graph `showAs` values that mean the person is not available. */
export function isOutlookOofShowAs(showAs: string | null | undefined): boolean {
  return OOF_SHOW_AS.has((showAs || "").trim().toLowerCase());
}

/** All-day Outlook «Abwesend» (WorkBuddy absence + German template). */
export function isAllDayAbwesendSubject(subject: string): boolean {
  const t = subject.trim().toLowerCase();
  return t === "abwesend" || t.startsWith("abwesend ") || t.startsWith("abwesend:");
}

/**
 * All-day OOO: `showAs` oof/away, or all-day titled Abwesend.
 * Timed meetings with oof/away do not mark the whole day.
 */
export function isOutlookDayAbsence(event: {
  isAllDay: boolean;
  showAs: string | null;
  subject: string;
}): boolean {
  if (!event.isAllDay) return false;
  return isOutlookOofShowAs(event.showAs) || isAllDayAbwesendSubject(event.subject);
}

/** Inclusive start / exclusive Graph end for all-day events. */
export function eventCoversYmd(
  event: Pick<OutlookAbsenceEvent, "date" | "start" | "end" | "isAllDay">,
  ymd: string
): boolean {
  const startYmd = (event.start || "").slice(0, 10) || event.date;
  if (!startYmd || !ymd) return false;
  if (!event.isAllDay) return startYmd === ymd;
  let endExclusive = (event.end || "").slice(0, 10);
  if (!endExclusive || endExclusive <= startYmd) {
    endExclusive = addDaysYmd(startYmd, 1);
  }
  return startYmd <= ymd && ymd < endExclusive;
}

export function findOutlookDayAbsence(
  events: OutlookAbsenceEvent[],
  ymd: string
): OutlookAbsenceEvent | null {
  return (
    events.find(
      (event) => isOutlookDayAbsence(event) && eventCoversYmd(event, ymd)
    ) ?? null
  );
}

export function applyOofPresenceFromEvents(input: {
  userId: number;
  ymd: string;
  events: OutlookAbsenceEvent[];
}): OofSyncResult {
  const ymd = sanitizeYmd(input.ymd);
  if (!ymd || !Number.isInteger(input.userId) || input.userId <= 0) {
    return { action: "unchanged", reason: "invalid" };
  }
  const match = findOutlookDayAbsence(input.events, ymd);
  const existing = getUserDayStatus(input.userId, ymd);
  if (match) {
    if (oofMustNotOverwrite(existing)) {
      return {
        action: "skipped",
        reason: existing?.source === "deputy" ? "deputy" : `self-${existing?.status}`,
      };
    }
    upsertUserDayStatus({
      userId: input.userId,
      ymd,
      status: "absent",
      source: "oof",
      setByUserId: input.userId,
      note: match.subject?.trim() || "Outlook",
    });
    return { action: "applied" };
  }
  if (existing?.source === "oof") {
    deleteUserDayStatus(input.userId, ymd);
    return { action: "cleared" };
  }
  return { action: "unchanged" };
}

const lastSyncAt = new Map<string, number>();
const DEBOUNCE_MS = 60_000;

function syncKey(userId: number, ymd: string): string {
  return `${userId}:${ymd}`;
}

export function resetOofSyncDebounceForTests(): void {
  lastSyncAt.clear();
}

export function listOofSyncUserIds(): number[] {
  return listActiveUsersWithModule("microsoft")
    .filter(
      (user) =>
        isMicrosoftConnected(user.id) && hasMicrosoftCalendarScope(user.id)
    )
    .map((user) => user.id);
}

export async function syncOofPresenceForUser(
  userId: number,
  ymd: string,
  options?: { force?: boolean }
): Promise<OofSyncResult> {
  const day = sanitizeYmd(ymd);
  if (!day || !Number.isInteger(userId) || userId <= 0) {
    return { action: "unchanged", reason: "invalid" };
  }
  if (!isMicrosoftConnected(userId) || !hasMicrosoftCalendarScope(userId)) {
    return { action: "unchanged", reason: "disconnected" };
  }
  const key = syncKey(userId, day);
  if (!options?.force) {
    const prev = lastSyncAt.get(key);
    if (prev != null && Date.now() - prev < DEBOUNCE_MS) {
      return { action: "unchanged", reason: "debounced" };
    }
  }
  try {
    const events = await listMicrosoftEventsInRange(userId, day, day);
    const result = applyOofPresenceFromEvents({ userId, ymd: day, events });
    lastSyncAt.set(key, Date.now());
    return result;
  } catch (error) {
    console.warn("[presence] oof sync", userId, error);
    return { action: "unchanged", reason: "error" };
  }
}

export async function syncOofPresenceForConnectedUsers(
  ymd: string,
  options?: { force?: boolean }
): Promise<{
  attempted: boolean;
  synced: number;
  applied: number;
  cleared: number;
  skipped: number;
}> {
  const day = sanitizeYmd(ymd);
  if (!day) {
    return { attempted: false, synced: 0, applied: 0, cleared: 0, skipped: 0 };
  }
  const userIds = listOofSyncUserIds();
  if (userIds.length === 0) {
    return { attempted: false, synced: 0, applied: 0, cleared: 0, skipped: 0 };
  }
  const results = await Promise.all(
    userIds.map((userId) =>
      syncOofPresenceForUser(userId, day, options).catch((error) => {
        console.warn("[presence] oof sync", userId, error);
        return { action: "unchanged" as const, reason: "error" };
      })
    )
  );
  let applied = 0;
  let cleared = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.action === "applied") applied += 1;
    else if (result.action === "cleared") cleared += 1;
    else if (result.action === "skipped") skipped += 1;
  }
  return {
    attempted: true,
    synced: userIds.length,
    applied,
    cleared,
    skipped,
  };
}

/** Scheduler / ticket-tick entry: today for every connected Outlook user. */
export async function syncOofPresenceIfDue(options?: {
  force?: boolean;
}): Promise<{
  attempted: boolean;
  synced: number;
  applied: number;
  cleared: number;
  skipped: number;
}> {
  return syncOofPresenceForConnectedUsers(zurichYmd(), {
    force: options?.force ?? true,
  });
}
