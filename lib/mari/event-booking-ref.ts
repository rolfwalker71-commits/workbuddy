/**
 * Kunde / Projekt / Vertrag on a calendar event — display + Graph marker.
 * Client-safe (no db / Graph).
 */

import { isAllowedCompanyEmail } from "@/lib/auth/allowed-email";

export type EventBookingRefSource = "ticket" | "pinned" | "graph" | "guess";

/** Internal-only = company domains only. Mixed = at least one external attendee. */
export type EventMeetingKind = "internal" | "mixed";

export type EventBookingRef = {
  cardCode: string | null;
  customerName: string | null;
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
  contractVisible: string | null;
  source: EventBookingRefSource;
  meetingKind: EventMeetingKind;
  /** Internal meetings: Vertrag typically not needed. */
  contractOptional: boolean;
};

export const BUDDY_BOOK_CATEGORY = "WorkBuddy/Book";

/** Compact codes on the Outlook category (fallback if body preview drops the marker). */
export const BUDDY_BOOK_KPV_CATEGORY_RE =
  /^(?:Buddy|WorkBuddy)\/KPV:([^:]*):([^:]*):([^:]*)$/i;

/** Body/description marker. `[[workbuddy:book:C1471|P600111|123|V60011100]]` */
export const BUDDY_BOOK_BODY_MARKER_RE =
  /\[\[(?:buddy|workbuddy):book:([^|\]]*)\|([^|\]]*)\|([^|\]]*)\|?([^|\]]*)\]\]/i;

/** Persist/read hours-booking pin on the Outlook series, not each occurrence. */
export function eventBookingSeriesKey(input: {
  eventId: string;
  seriesMasterId?: string | null;
  iCalUId?: string | null;
}): string {
  const master = (input.seriesMasterId || "").trim();
  if (master) return master;
  const uid = (input.iCalUId || "").trim();
  if (uid) return `ical:${uid}`;
  return (input.eventId || "").trim();
}

/** Graph PATCH target: series master id, never the iCal: fallback key. */
export function eventBookingGraphEventId(input: {
  eventId: string;
  seriesMasterId?: string | null;
}): string {
  return (input.seriesMasterId || "").trim() || (input.eventId || "").trim();
}

export function classifyEventMeetingKind(
  emails: string[] | null | undefined
): EventMeetingKind {
  const list = (emails || [])
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
  if (list.some((e) => !isAllowedCompanyEmail(e))) return "mixed";
  return "internal";
}

export function emptyEventBookingRef(
  source: EventBookingRefSource = "guess",
  meetingKind: EventMeetingKind = "mixed"
): EventBookingRef {
  return {
    cardCode: null,
    customerName: null,
    projectNumber: null,
    projectLabel: null,
    contractId: null,
    contractVisible: null,
    source,
    meetingKind,
    contractOptional: meetingKind === "internal",
  };
}

export function eventBookingRefHasCodes(
  ref: EventBookingRef | null | undefined
): boolean {
  if (!ref) return false;
  return Boolean(
    (ref.cardCode || "").trim() ||
      (ref.customerName || "").trim() ||
      (ref.projectNumber || "").trim() ||
      (ref.contractVisible || "").trim() ||
      (ref.contractId != null && ref.contractId > 0)
  );
}

/** Customer/project/contract hit, or an internal-only meeting (easy to book). */
export function eventBookingRefHasHit(
  ref: EventBookingRef | null | undefined
): boolean {
  if (!ref) return false;
  if (ref.meetingKind === "internal") return true;
  return eventBookingRefHasCodes(ref);
}

/** Compact line: only fields that have a hit. */
export function formatEventBookingLine(
  ref: EventBookingRef | null | undefined
): string {
  if (!ref) return "";
  const parts: string[] = [];
  const kunde = (ref.customerName || ref.cardCode || "").trim();
  if (kunde) parts.push(kunde);
  const proj = (ref.projectNumber || ref.projectLabel || "").trim();
  if (proj && proj !== kunde) parts.push(proj);
  else if (ref.meetingKind === "internal" && !kunde) {
    parts.push("Intern");
  }
  const vertrag = (ref.contractVisible || "").trim();
  if (vertrag) parts.push(vertrag);
  else if (ref.contractId != null && ref.contractId > 0) {
    parts.push(String(ref.contractId));
  } else if (ref.meetingKind === "internal" || ref.contractOptional) {
    parts.push("kein Vertrag");
  }
  return parts.join(" · ");
}

/** Booked card line: prefix + Kunde · Projekt · Vertrag. */
export function formatBookedHoursLine(
  ref: EventBookingRef | null | undefined
): string {
  const line = formatEventBookingLine(ref);
  return line ? `Zeiterfassung: ${line}` : "Zeiterfassung";
}

export function buddyBookKpvCategory(ref: EventBookingRef): string {
  const card = (ref.cardCode || "").trim().toUpperCase();
  const proj = (ref.projectNumber || "").trim().toUpperCase();
  const cid =
    ref.contractId != null && ref.contractId > 0 ? String(ref.contractId) : "";
  return `WorkBuddy/KPV:${card}:${proj}:${cid}`.slice(0, 255);
}

export function formatBookBodyMarker(ref: EventBookingRef): string {
  const card = (ref.cardCode || "").trim();
  const proj = (ref.projectNumber || "").trim();
  const cid =
    ref.contractId != null && ref.contractId > 0 ? String(ref.contractId) : "";
  const vis = (ref.contractVisible || "").trim();
  return `[[workbuddy:book:${card}|${proj}|${cid}|${vis}]]`;
}

export function parseBookRefFromBody(
  body: string | null | undefined
): EventBookingRef | null {
  const m = BUDDY_BOOK_BODY_MARKER_RE.exec(body || "");
  if (!m) return null;
  const cardCode = (m[1] || "").trim() || null;
  const projectNumber = (m[2] || "").trim() || null;
  const cidRaw = (m[3] || "").trim();
  const cid = Number(cidRaw);
  const contractVisible = (m[4] || "").trim() || null;
  const ref: EventBookingRef = {
    cardCode,
    customerName: null,
    projectNumber,
    projectLabel: null,
    contractId: Number.isInteger(cid) && cid > 0 ? cid : null,
    contractVisible,
    source: "graph",
    meetingKind: "mixed",
    contractOptional: false,
  };
  return eventBookingRefHasCodes(ref) ? ref : null;
}

export function parseBookRefFromCategories(
  categories: string[] | null | undefined
): EventBookingRef | null {
  for (const raw of categories || []) {
    const m = BUDDY_BOOK_KPV_CATEGORY_RE.exec(raw.trim());
    if (!m) continue;
    const cardCode = (m[1] || "").trim() || null;
    const projectNumber = (m[2] || "").trim() || null;
    const cid = Number((m[3] || "").trim());
    const ref: EventBookingRef = {
      cardCode,
      customerName: null,
      projectNumber,
      projectLabel: null,
      contractId: Number.isInteger(cid) && cid > 0 ? cid : null,
      contractVisible: null,
      source: "graph",
      meetingKind: "mixed",
      contractOptional: false,
    };
    if (eventBookingRefHasCodes(ref)) return ref;
  }
  return null;
}

export function appendBookBodyMarker(
  notes: string | null | undefined,
  ref: EventBookingRef
): string {
  const marker = formatBookBodyMarker(ref);
  const base = (notes || "").replace(BUDDY_BOOK_BODY_MARKER_RE, "").trim();
  return base ? `${base}\n\n${marker}` : marker;
}

export function mergeOutlookBookCategories(
  existing: string[] | null | undefined,
  ref: EventBookingRef
): string[] {
  const next = (existing || []).map((c) => c.trim()).filter(Boolean);
  const dropKpv = next.filter((c) => !BUDDY_BOOK_KPV_CATEGORY_RE.test(c));
  const hasBook = dropKpv.some(
    (c) => c.toLowerCase() === BUDDY_BOOK_CATEGORY.toLowerCase()
  );
  if (!hasBook) dropKpv.push(BUDDY_BOOK_CATEGORY);
  if (eventBookingRefHasCodes(ref)) dropKpv.push(buddyBookKpvCategory(ref));
  return dropKpv;
}

const SOURCE_RANK: Record<EventBookingRefSource, number> = {
  pinned: 4,
  ticket: 3,
  graph: 2,
  guess: 1,
};

/** Stronger source wins. Ticket stays above guess/graph. */
export function pickPreferredBookingRef(
  ...cands: Array<EventBookingRef | null | undefined>
): EventBookingRef | null {
  let best: EventBookingRef | null = null;
  for (const c of cands) {
    if (!c || !eventBookingRefHasHit(c)) continue;
    if (!best || SOURCE_RANK[c.source] > SOURCE_RANK[best.source]) {
      best = c;
    }
  }
  return best;
}

export type EventBookingSuggestion = {
  cardCode: string;
  name: string;
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
};

export type EventTitleBookingHint = {
  cardCode: string | null;
  projectNumber: string | null;
  contractVisible: string | null;
  suggestions: EventBookingSuggestion[];
  prefill: {
    projectNumber: string | null;
    projectLabel: string | null;
    contractId: number | null;
  };
};

export function applyMeetingKind(
  ref: EventBookingRef | null | undefined,
  meetingKind: EventMeetingKind
): EventBookingRef | null {
  if (!ref) return null;
  return withKind(
    {
      cardCode: ref.cardCode,
      customerName: ref.customerName,
      projectNumber: ref.projectNumber,
      projectLabel: ref.projectLabel,
      contractId: ref.contractId,
      contractVisible: ref.contractVisible,
      source: ref.source,
    },
    meetingKind
  );
}

function withKind(
  ref: Omit<EventBookingRef, "meetingKind" | "contractOptional">,
  meetingKind: EventMeetingKind
): EventBookingRef {
  const contractOptional =
    meetingKind === "internal" &&
    !(ref.contractId != null && ref.contractId > 0) &&
    !(ref.contractVisible || "").trim();
  return {
    ...ref,
    meetingKind,
    contractOptional,
    contractId: contractOptional ? 0 : ref.contractId,
  };
}

/**
 * Title C/P/V always. Mixed: Kunden-Ansprechpartner (exact email) before
 * freitext name. Internal-only: never look up colleague mails — intern + kein Vertrag.
 */
export function bookingRefFromRecognition(input: {
  title: EventTitleBookingHint;
  attendees: EventBookingSuggestion[];
  meetingKind: EventMeetingKind;
}): EventBookingRef | null {
  const kind = input.meetingKind;
  const titleHit = input.title.suggestions[0] || null;
  const prefill = input.title.prefill;
  const hasTitleToken = Boolean(
    input.title.projectNumber ||
      input.title.cardCode ||
      input.title.contractVisible
  );

  if (hasTitleToken) {
    const ref = withKind(
      {
        cardCode: titleHit?.cardCode || input.title.cardCode,
        customerName: titleHit?.name || null,
        projectNumber: prefill.projectNumber || input.title.projectNumber,
        projectLabel: prefill.projectLabel,
        contractId: prefill.contractId,
        contractVisible: input.title.contractVisible,
        source: "guess",
      },
      kind
    );
    return eventBookingRefHasCodes(ref) ? ref : internStub(kind);
  }

  if (kind === "mixed") {
    const attWithProject =
      input.attendees.find((a) => (a.projectNumber || "").trim()) || null;
    const att = attWithProject || input.attendees[0] || null;
    if (att) {
      return withKind(
        {
          cardCode: att.cardCode,
          customerName: att.name,
          projectNumber: att.projectNumber,
          projectLabel: att.projectLabel,
          contractId: att.contractId,
          contractVisible: null,
          source: "guess",
        },
        kind
      );
    }
  }

  if (titleHit) {
    return withKind(
      {
        cardCode: titleHit.cardCode,
        customerName: titleHit.name,
        projectNumber: titleHit.projectNumber,
        projectLabel: titleHit.projectLabel,
        contractId: titleHit.contractId,
        contractVisible: null,
        source: "guess",
      },
      kind
    );
  }

  return internStub(kind);
}

function internStub(kind: EventMeetingKind): EventBookingRef | null {
  if (kind !== "internal") return null;
  return withKind(
    {
      cardCode: null,
      customerName: null,
      projectNumber: null,
      projectLabel: null,
      contractId: 0,
      contractVisible: null,
      source: "guess",
    },
    "internal"
  );
}
