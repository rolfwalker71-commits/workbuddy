/**
 * Ticket-Änderungserkennung — reiner Kern ohne DB und ohne MARI-Zugriff.
 *
 * Herausgelöst aus `sync-tickets-if-due.ts`, damit die Regeln testbar sind:
 * welche Änderung zu welcher Meldungsart wird, entscheidet sich hier.
 */
import type { NotifyReason } from "@/lib/realtime/hub";
import { statusChipLabel } from "@/lib/mari/status";
import { toSwissDate } from "@/lib/utils/dates";

/**
 * Hochzählen erzwingt genau einen stillen Baseline-Durchlauf, wenn die
 * Momentaufnahme um Felder wächst — sonst würde jedes neue Feld beim ersten
 * Vergleich als Änderung an allen Tickets gleichzeitig gelten.
 */
export const MARI_SNAPSHOT_VERSION = 2;

export type MariTicketScope = "assigned" | "allNew" | "watched";

export type MariTicketSnapshotRow = {
  issueId: number;
  status: number;
  dueDate: string | null;
  changeAtDate: string | null;
  briefDescription: string;
  // Ab Version 2 — alle optional, damit alte Momentaufnahmen weiter passen.
  priority?: number;
  handledBy?: string | null;
  supportGroupId?: number | null;
  requestDate?: string | null;
  /** Zeitpunkt des neuesten kundenseitigen Verlaufseintrags. */
  lastCustomerAt?: string | null;
  /** Über welche Umfänge das Ticket in den Blick geriet. */
  scopes?: MariTicketScope[];
};

export type MariTicketChangeKind =
  | "new"
  | "assigned"
  | "status"
  | "reply"
  | "due"
  | "priority"
  | "handler"
  | "update";

export type MariTicketChangeEvent = {
  at: string;
  issueId: number;
  title: string;
  kind: MariTicketChangeKind;
  detail: string;
  scopes: MariTicketScope[];
};

const KIND_REASON: Record<MariTicketChangeKind, NotifyReason> = {
  new: "mari_ticket_new",
  status: "mari_ticket_status",
  reply: "mari_ticket_reply",
  assigned: "mari_ticket_field",
  due: "mari_ticket_field",
  priority: "mari_ticket_field",
  handler: "mari_ticket_field",
  update: "mari_ticket_field",
};

export function reasonForChangeKind(kind: MariTicketChangeKind): NotifyReason {
  return KIND_REASON[kind];
}

export function sameDay(a: string | null, b: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

export type TicketForSnapshot = {
  issueId: number;
  status: number;
  dueDate?: string | null;
  changeAtDate?: string | null;
  briefDescription?: string | null;
  priority?: number | null;
  handledBy?: string | null;
  supportGroupId?: number | null;
  requestDate?: string | null;
};

export function ticketToSnapshot(
  t: TicketForSnapshot,
  scopes: MariTicketScope[] = [],
  lastCustomerAt: string | null = null
): MariTicketSnapshotRow {
  return {
    issueId: t.issueId,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.slice(0, 10) : null,
    changeAtDate: t.changeAtDate || null,
    briefDescription: (t.briefDescription || "").slice(0, 200),
    priority: typeof t.priority === "number" ? t.priority : undefined,
    handledBy: t.handledBy ?? null,
    supportGroupId:
      typeof t.supportGroupId === "number" ? t.supportGroupId : null,
    requestDate: t.requestDate || null,
    lastCustomerAt,
    scopes,
  };
}

/** Ein Ticket gilt als neu, wenn es seit dem letzten Abruf angelegt wurde. */
function isFreshTicket(row: MariTicketSnapshotRow, sinceIso: string | null): boolean {
  if (!row.requestDate) return true;
  if (!sinceIso) return true;
  return row.requestDate >= sinceIso.slice(0, 10);
}

export function diffTickets(
  prev: MariTicketSnapshotRow[],
  next: MariTicketSnapshotRow[],
  at: string,
  options?: { since?: string | null }
): MariTicketChangeEvent[] {
  const prevMap = new Map(prev.map((p) => [p.issueId, p]));
  const changes: MariTicketChangeEvent[] = [];
  const since = options?.since ?? null;

  for (const n of next) {
    const scopes = n.scopes ?? [];
    const base = { at, issueId: n.issueId, title: n.briefDescription, scopes };
    const p = prevMap.get(n.issueId);

    if (!p) {
      // Unterscheidet echtes Neueingehen von "taucht bei mir auf, weil es mir
      // zugewiesen wurde". Ohne das würden Umfang (a) und (b) dasselbe Ticket
      // beide als "neu" melden.
      if (isFreshTicket(n, since)) {
        changes.push({
          ...base,
          kind: "new",
          detail: `Neu eingegangen · ${statusChipLabel(n.status)}`,
        });
      } else {
        changes.push({
          ...base,
          kind: "assigned",
          detail: `Neu in deiner Liste · ${statusChipLabel(n.status)}`,
        });
      }
      continue;
    }

    if (p.status !== n.status) {
      changes.push({
        ...base,
        kind: "status",
        detail: `Status: ${statusChipLabel(p.status)} → ${statusChipLabel(n.status)}`,
      });
    }

    // Felder, die es in Version 1 noch nicht gab, erst vergleichen, wenn die
    // vorherige Momentaufnahme sie überhaupt kannte.
    const customerReplied =
      p.lastCustomerAt !== undefined &&
      n.lastCustomerAt != null &&
      n.lastCustomerAt !== p.lastCustomerAt;
    if (customerReplied) {
      changes.push({
        ...base,
        kind: "reply",
        detail: "Neue Rückmeldung vom Kunden",
      });
    }

    if (!sameDay(p.dueDate, n.dueDate)) {
      changes.push({
        ...base,
        kind: "due",
        detail: `Stichtag: ${toSwissDate(p.dueDate)} → ${toSwissDate(n.dueDate)}`,
      });
    }

    if (
      p.priority !== undefined &&
      n.priority !== undefined &&
      p.priority !== n.priority
    ) {
      changes.push({
        ...base,
        kind: "priority",
        detail: `Priorität geändert (${p.priority} → ${n.priority})`,
      });
    }

    if (
      p.handledBy !== undefined &&
      n.handledBy !== undefined &&
      (p.handledBy || null) !== (n.handledBy || null)
    ) {
      changes.push({
        ...base,
        kind: "handler",
        detail: `Zuständigkeit: ${p.handledBy || "–"} → ${n.handledBy || "–"}`,
      });
    }

    // Nur wenn sonst nichts Konkretes gefunden wurde — sonst meldet dasselbe
    // Ereignis zweimal.
    const alreadyReported = changes.some(
      (c) => c.issueId === n.issueId && c.at === at
    );
    if (
      !alreadyReported &&
      p.changeAtDate !== n.changeAtDate &&
      n.changeAtDate
    ) {
      changes.push({
        ...base,
        kind: "update",
        detail: "Aktualisierung / Kommentar",
      });
    }
  }
  return changes;
}

/** Nur Ereignisse behalten, deren Umfang der Benutzer eingeschaltet hat. */
export function filterChangesByScopes(
  changes: readonly MariTicketChangeEvent[],
  enabled: Record<MariTicketScope, boolean>
): MariTicketChangeEvent[] {
  return changes.filter((change) => {
    if (change.scopes.length === 0) return true;
    return change.scopes.some((scope) => enabled[scope]);
  });
}

export function groupChangesByReason(
  changes: readonly MariTicketChangeEvent[]
): Map<NotifyReason, MariTicketChangeEvent[]> {
  const out = new Map<NotifyReason, MariTicketChangeEvent[]>();
  for (const change of changes) {
    const reason = reasonForChangeKind(change.kind);
    const list = out.get(reason);
    if (list) list.push(change);
    else out.set(reason, [change]);
  }
  return out;
}

const REASON_HEADLINE: Record<string, { one: string; many: string }> = {
  mari_ticket_new: { one: "Neues Ticket", many: "neue Tickets" },
  mari_ticket_status: { one: "Statuswechsel", many: "Statuswechsel" },
  mari_ticket_reply: { one: "Neue Kundenantwort", many: "neue Kundenantworten" },
  mari_ticket_field: { one: "Ticket aktualisiert", many: "Ticket-Änderungen" },
};

/** Eine gebündelte Meldung je Art — nicht eine je Ticket. */
export function formatTicketChangeDigest(
  reason: NotifyReason,
  changes: readonly MariTicketChangeEvent[]
): { headline: string; detail: string } {
  const words = REASON_HEADLINE[reason] || {
    one: "Ticket-Update",
    many: "Ticket-Updates",
  };
  const headline =
    changes.length === 1
      ? `Maringo #${changes[0]!.issueId}: ${words.one}`
      : `Maringo: ${changes.length} ${words.many}`;

  const top = changes.slice(0, 3);
  const parts = top.map((c) => `#${c.issueId}: ${c.detail}`);
  if (changes.length > top.length) {
    parts.push(`+${changes.length - top.length} weitere`);
  }
  return { headline, detail: parts.join(" · ") };
}
