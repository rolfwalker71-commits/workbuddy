/**
 * Optional Outlook-Betreff-Konvention für Stundenbuchung.
 * Nur Prefill / Chips — nie still buchen.
 *
 *   C1471  → Kunde bekannt → Vorschlag Projekt + Vertrag
 *   P600111 → Projekt bekannt → Vorschlag Kunde + Vertrag
 *   V60011100 → Vertrag bekannt → Vorschlag Kunde + Projekt
 *   Filados → Freitext → optional nur Kunde
 *
 * Spezifischer gewinnt: P vor C fürs Projekt. Nicht gegeneinander anschreiben.
 *
 *   P600111 · Support Tanner
 *   P600111 V60011100 · Workshop
 *   C1471 · Support Filados
 */

export const DEFAULT_EVENT_ACTIVITY = "Besprechung";

export type EventTitleTokens = {
  projectNumber: string | null;
  contractVisible: string | null;
  /** Erster C-CardCode im Betreff (z.B. C1471). */
  cardCode: string | null;
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
const CUSTOMER_TOKEN_RE = /\bC\d{3,}\b/i;
const ACTIVITY_SEP_RE = /[·|]/;

/** Kurze/generische Betreff-Wörter — keine Kundensuche. */
const EVENT_TITLE_NAME_STOPWORDS = new Set([
  "termin",
  "meeting",
  "call",
  "daily",
  "support",
  "workshop",
  "besprechung",
  "intern",
  "internal",
  "kunde",
  "kundentermin",
  "teams",
  "zoom",
  "outlook",
  "sync",
  "standup",
  "review",
  "planung",
  "abstimmung",
  "update",
  "status",
  "weekly",
  "monthly",
  "morning",
  "afternoon",
  "ohne",
  "projekt",
  "test",
  "und",
  "mit",
  "für",
  "von",
  "beim",
  "oder",
  "the",
  "and",
  "for",
  "with",
  "from",
  "online",
  "onsite",
  "office",
  "homeoffice",
  "kickoff",
  "demo",
  "training",
  "schulung",
  "intro",
  "followup",
  "nacharbeit",
]);

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
      cardCode: null,
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

  const customerMatch = CUSTOMER_TOKEN_RE.exec(memo);
  const cardCode = customerMatch ? customerMatch[0].toUpperCase() : null;

  const hasTokens =
    projectNumber != null || contractVisible != null || cardCode != null;
  let activity: string;
  if (hasTokens) {
    const sepIdx = memo.search(ACTIVITY_SEP_RE);
    if (sepIdx >= 0) {
      activity = memo
        .slice(sepIdx + 1)
        .replace(/\bP\d{3,}\b/gi, "")
        .replace(/\bV\d{6,}\b/gi, "")
        .replace(/\bC\d{3,}\b/gi, "")
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
    cardCode,
    activity: activity.slice(0, 100),
    memo: memo.slice(0, 500),
    hasTokens,
  };
}

/** Freitext-Kandidaten für eine konservative Kundensuche (min. 4 Zeichen). */
export function eventTitleNameCandidates(
  subject: string | null | undefined
): string[] {
  const stripped = (subject || "")
    .replace(/\bP\d{3,}\b/gi, " ")
    .replace(/\bV\d{6,}\b/gi, " ")
    .replace(/\bC\d{3,}\b/gi, " ")
    .replace(/[·|/,;:()[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = stripped.match(/[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9']{3,}/g) || [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    const key = w.toLowerCase();
    if (EVENT_TITLE_NAME_STOPWORDS.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, 2);
}

/** Exakt oder beginnt-mit — keine Contains-Treffer auf kurze Wörter. */
export function isConfidentCustomerNameHit(
  query: string,
  name: string,
  cardCode?: string | null
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 4) return false;
  const n = name.trim().toLowerCase();
  const code = (cardCode || "").trim().toLowerCase();
  if (code === q || n === q) return true;
  if (n.startsWith(q)) return true;
  const first = n.split(/\s+/)[0] || "";
  if (first === q) return true;
  if (q.length >= 5 && first.startsWith(q)) return true;
  return false;
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
