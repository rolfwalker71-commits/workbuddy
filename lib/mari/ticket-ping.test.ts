import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeTicketPingHtml,
  formatTicketPingHtml,
  ticketPingFields,
} from "./ticket-ping-format.ts";
import type { MariTicketDetail } from "./tickets.ts";

test("ticketPingFields maps Kopf values and dashes empties", () => {
  const fields = ticketPingFields({
    issueId: 42001,
    briefDescription: "Drucker klemmt",
    statusName: "In Arbeit",
    priorityName: "Hoch",
    cardCode: "C100",
    addressMatchcode: "ACME",
    projectNumber: "P200000",
    handledBy: "M1010",
    handledByName: "Rolf Walker",
  } as MariTicketDetail);
  assert.deepEqual(fields, {
    issueId: 42001,
    subject: "Drucker klemmt",
    customer: "ACME",
    project: "P200000",
    status: "In Arbeit",
    priority: "Hoch",
    responsible: "Rolf Walker",
  });
  const empty = ticketPingFields({
    issueId: 1,
    briefDescription: "",
    statusName: "",
    priorityName: "",
    cardCode: null,
    addressMatchcode: null,
    projectNumber: null,
    handledBy: null,
    handledByName: null,
  } as MariTicketDetail);
  assert.equal(empty.subject, "–");
  assert.equal(empty.customer, "–");
});

test("formatTicketPingHtml includes Kopf and clickable link", () => {
  const html = formatTicketPingHtml(
    {
      issueId: 9,
      subject: "A < B",
      customer: "Kunde",
      project: "P1",
      status: "Offen",
      priority: "Tief",
      responsible: "Anna",
    },
    "https://workbuddy.example/maringo?open=9"
  );
  assert.match(html, /Ticket #9/);
  assert.match(html, /A &lt; B/);
  assert.match(
    html,
    /<a href="https:\/\/workbuddy\.example\/maringo\?open=9">Ticket in WorkBuddy öffnen<\/a>/
  );
  assert.match(html, /Zuständig: Anna/);
  assert.equal(escapeTicketPingHtml('"x"'), "&quot;x&quot;");
});
