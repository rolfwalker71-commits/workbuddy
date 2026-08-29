/**
 * Optional Outlook-Betreff-Konvention für Stundenbuchung.
 * Nur Prefill — nie still buchen.
 *
 *   P600111 · Support Tanner
 *   P600111 V60011100 · Workshop
 */

export const DEFAULT_EVENT_ACTIVITY = "Besprechung";

export type EventTitleTokens = {
  projectNumber: string | null;
  contractVisible: string | null;
  activity: string;
  memo: string;
  hasTokens: boolean;
};

export type CalendarEventBookDefaults = {
  dayOfService: string;
  issueId: number | null;
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
  contractPositionId: number | null;
  contractVisible: string | null;
  activity: string;
  memoText: string;
  hours: number;
  hoursBillable: number;
  billable: true;
};

const PROJECT_TOKEN_RE = /\bP\d{3,}\b/i;
const CONTRACT_TOKEN_RE = /\bV\d{6,}\b/gi;
const ACTIVITY_SEP_RE = /[·|]/;

/** Quarter-hours between HH:mm times. Null if missing or end ≤ start. */
export function hoursBetweenHm(
  startHm: string,
  endHm: string
): number | null {
  const parse = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const a = parse(startHm);
  const b = parse(endHm);
  if (a == null || b == null || b <= a) return null;
  const hours = (b - a) / 60;
  return Math.round(hours * 4) / 4;
}

/** Termindauer as bookable hours (0.25–24). Missing duration → 0.25. */
export function eventBookHoursFromDuration(
  startHm: string | null | undefined,
  endHm: string | null | undefined
): number {
  const raw =
    startHm && endHm ? hoursBetweenHm(startHm, endHm) : null;
  if (raw == null || raw < 0.01) return 0.25;
  return Math.min(24, raw);
}

export function parseEventTitleTokens(
  subject: string | null | undefined
): EventTitleTokens {
  const memo = (subject || "").trim();
  if (!memo) {
    return {
      projectNumber: null,
      contractVisible: null,
      activity: DEFAULT_EVENT_ACTIVITY,
      memo: "",
      hasTokens: false,
    };
  }

  const projectMatch = PROJECT_TOKEN_RE.exec(memo);
  const projectNumber = projectMatch
    ? projectMatch[0].toUpperCase()
    : null;

  let contractVisible: string | null = null;
  for (const raw of memo.match(CONTRACT_TOKEN_RE) || []) {
    const up = raw.toUpperCase();
    if (up !== projectNumber) {
      contractVisible = up;
      break;
    }
  }

  const hasTokens = projectNumber != null || contractVisible != null;
  let activity: string;
  if (hasTokens) {
    const sepIdx = memo.search(ACTIVITY_SEP_RE);
    if (sepIdx >= 0) {
      activity = memo
        .slice(sepIdx + 1)
        .replace(/\bP\d{3,}\b/gi, "")
        .replace(/\bV\d{6,}\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    } else {
      activity = DEFAULT_EVENT_ACTIVITY;
    }
  } else {
    activity = memo;
  }

  if (!activity) activity = DEFAULT_EVENT_ACTIVITY;

  return {
    projectNumber,
    contractVisible,
    activity: activity.slice(0, 100),
    memo: memo.slice(0, 500),
    hasTokens,
  };
}

/**
 * Prefill for the time-book dialog from a calendar event.
 * Ticket project/contract win over title tokens. Hours always come from
 * the event duration (editable later — never locked).
 */
export function calendarEventToBookDefaults(input: {
  title: string;
  date: string;
  startHm?: string | null;
  endHm?: string | null;
  /** Stamp-Memo, sonst Titel. */
  memo?: string | null;
  ticket?: {
    issueId: number;
    projectNumber?: string | null;
    projectLabel?: string | null;
    contractId?: number | null;
    contractPositionId?: number | null;
    activity?: string | null;
  } | null;
}): CalendarEventBookDefaults {
  const tokens = parseEventTitleTokens(input.title);
  const hours = eventBookHoursFromDuration(input.startHm, input.endHm);
  const ticket = input.ticket;
  const ticketId =
    ticket && Number.isInteger(ticket.issueId) && ticket.issueId > 0
      ? ticket.issueId
      : null;
  const ticketProject = (ticket?.projectNumber || "").trim() || null;
  const activity =
    (ticket?.activity || "").trim().slice(0, 100) || tokens.activity;

  return {
    dayOfService: input.date,
    issueId: ticketId,
    projectNumber: ticketProject || tokens.projectNumber,
    projectLabel: ticketProject
      ? ticket?.projectLabel || ticketProject
      : tokens.projectNumber,
    contractId:
      ticket?.contractId != null && ticket.contractId > 0
        ? ticket.contractId
        : null,
    contractPositionId:
      ticket?.contractPositionId != null && ticket.contractPositionId > 0
        ? ticket.contractPositionId
        : null,
    contractVisible: ticketId ? null : tokens.contractVisible,
    activity,
    memoText:
      (input.memo || "").trim().slice(0, 500) ||
      tokens.memo ||
      input.title.trim().slice(0, 500),
    hours,
    hoursBillable: hours,
    billable: true,
  };
}
