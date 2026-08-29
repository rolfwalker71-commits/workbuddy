import { absoluteAppUrl } from "@/lib/app-url";
import type { MariTicketDetail } from "@/lib/mari/tickets";

export type TicketPingFields = {
  issueId: number;
  subject: string;
  customer: string;
  project: string;
  status: string;
  priority: string;
  responsible: string;
};

function dash(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  return t || "–";
}

export function ticketPingFields(ticket: MariTicketDetail): TicketPingFields {
  return {
    issueId: ticket.issueId,
    subject: dash(ticket.briefDescription),
    customer: dash(ticket.addressMatchcode || ticket.cardCode),
    project: dash(ticket.projectNumber),
    status: dash(ticket.statusName),
    priority: dash(ticket.priorityName),
    responsible: dash(ticket.handledByName || ticket.handledBy),
  };
}

export function ticketPingLink(issueId: number, request?: Request | null): string {
  return absoluteAppUrl(`/maringo?open=${issueId}`, request);
}

export function escapeTicketPingHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTicketPingHtml(
  fields: TicketPingFields,
  link: string
): string {
  const e = escapeTicketPingHtml;
  return [
    `<p><strong>Ticket #${fields.issueId}</strong> — ${e(fields.subject)}</p>`,
    `<p>Kunde: ${e(fields.customer)}<br/>`,
    `Projekt: ${e(fields.project)}<br/>`,
    `Status: ${e(fields.status)}<br/>`,
    `Prio: ${e(fields.priority)}<br/>`,
    `Zuständig: ${e(fields.responsible)}</p>`,
    `<p><a href="${e(link)}">Ticket in WorkBuddy öffnen</a></p>`,
  ].join("");
}
