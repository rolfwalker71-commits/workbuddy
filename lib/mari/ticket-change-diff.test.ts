import assert from "node:assert/strict";
import test from "node:test";
import {
  diffTickets,
  filterChangesByScopes,
  formatTicketChangeDigest,
  groupChangesByReason,
  reasonForChangeKind,
  sameDay,
  ticketToSnapshot,
  type MariTicketSnapshotRow,
} from "./ticket-change-diff.ts";

const AT = "2026-09-16T08:00:00.000Z";

function snap(patch: Partial<MariTicketSnapshotRow> = {}): MariTicketSnapshotRow {
  return {
    issueId: 4711,
    status: 1,
    dueDate: "2026-09-20",
    changeAtDate: "2026-09-15T10:00:00",
    briefDescription: "Beleg lässt sich nicht buchen",
    priority: 2,
    handledBy: "42",
    supportGroupId: 7,
    requestDate: "2026-09-01",
    lastCustomerAt: "2026-09-10T09:00:00",
    scopes: ["assigned"],
    ...patch,
  };
}

test("a ticket created since the last poll counts as new", () => {
  const changes = diffTickets([], [snap({ requestDate: "2026-09-16" })], AT, {
    since: "2026-09-15T08:00:00.000Z",
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.kind, "new");
  assert.equal(reasonForChangeKind("new"), "mari_ticket_new");
});

test("an older ticket appearing in my list is an assignment, not a new ticket", () => {
  // Sonst würden Umfang (a) und (b) dasselbe Ticket beide als "neu" melden.
  const changes = diffTickets([], [snap({ requestDate: "2026-08-01" })], AT, {
    since: "2026-09-15T08:00:00.000Z",
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.kind, "assigned");
  assert.equal(reasonForChangeKind("assigned"), "mari_ticket_field");
});

test("a status change is reported as its own kind", () => {
  const changes = diffTickets([snap()], [snap({ status: 3 })], AT);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.kind, "status");
  assert.match(changes[0]!.detail, /Status:/);
});

test("a customer reply only fires when the marker actually moves", () => {
  const before = snap();
  assert.deepEqual(diffTickets([before], [snap()], AT), []);

  const changes = diffTickets(
    [before],
    [snap({ lastCustomerAt: "2026-09-16T07:30:00", changeAtDate: "2026-09-16T07:30:00" })],
    AT
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.kind, "reply");
});

test("fields unknown to an older snapshot never fire on first comparison", () => {
  // Version 1 kannte weder priority noch lastCustomerAt — ohne diese Regel
  // würde der erste Vergleich alles auf einmal melden.
  const legacy: MariTicketSnapshotRow = {
    issueId: 4711,
    status: 1,
    dueDate: "2026-09-20",
    changeAtDate: "2026-09-15T10:00:00",
    briefDescription: "Beleg lässt sich nicht buchen",
  };
  const changes = diffTickets([legacy], [snap()], AT);
  assert.deepEqual(
    changes.map((c) => c.kind),
    [],
    `unerwartet: ${changes.map((c) => c.kind).join(", ")}`
  );
});

test("one ticket does not produce both a concrete change and a generic one", () => {
  const changes = diffTickets(
    [snap()],
    [snap({ status: 3, changeAtDate: "2026-09-16T07:00:00" })],
    AT
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.kind, "status");
});

test("priority and handler changes land in the catch-all reason", () => {
  const prio = diffTickets([snap()], [snap({ priority: 1 })], AT);
  assert.equal(prio[0]!.kind, "priority");
  const handler = diffTickets([snap()], [snap({ handledBy: "99" })], AT);
  assert.equal(handler[0]!.kind, "handler");
  for (const kind of ["priority", "handler", "due", "update"] as const) {
    assert.equal(reasonForChangeKind(kind), "mari_ticket_field");
  }
});

test("scope filtering drops events the user switched off", () => {
  const assigned = diffTickets([snap()], [snap({ status: 3 })], AT);
  const watched = diffTickets(
    [snap({ issueId: 99, scopes: ["watched"] })],
    [snap({ issueId: 99, status: 3, scopes: ["watched"] })],
    AT
  );
  const all = [...assigned, ...watched];
  const kept = filterChangesByScopes(all, {
    assigned: true,
    allNew: false,
    watched: false,
  });
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.issueId, 4711);
});

test("a ticket seen through several scopes survives if any of them is on", () => {
  const changes = diffTickets(
    [snap({ scopes: ["assigned", "watched"] })],
    [snap({ status: 3, scopes: ["assigned", "watched"] })],
    AT
  );
  const kept = filterChangesByScopes(changes, {
    assigned: false,
    allNew: false,
    watched: true,
  });
  assert.equal(kept.length, 1);
});

test("changes are grouped into one batch per reason", () => {
  const changes = [
    ...diffTickets([snap()], [snap({ status: 3 })], AT),
    ...diffTickets(
      [snap({ issueId: 5000 })],
      [snap({ issueId: 5000, status: 6 })],
      AT
    ),
    ...diffTickets([snap({ issueId: 6000 })], [snap({ issueId: 6000, priority: 1 })], AT),
  ];
  const grouped = groupChangesByReason(changes);
  assert.equal(grouped.get("mari_ticket_status")?.length, 2);
  assert.equal(grouped.get("mari_ticket_field")?.length, 1);
});

test("the digest text is singular, plural and capped at three", () => {
  const one = formatTicketChangeDigest("mari_ticket_status", [
    { at: AT, issueId: 1, title: "A", kind: "status", detail: "X", scopes: [] },
  ]);
  assert.equal(one.headline, "Maringo #1: Statuswechsel");

  const many = formatTicketChangeDigest(
    "mari_ticket_status",
    [1, 2, 3, 4, 5].map((id) => ({
      at: AT,
      issueId: id,
      title: "A",
      kind: "status" as const,
      detail: "X",
      scopes: [],
    }))
  );
  assert.equal(many.headline, "Maringo: 5 Statuswechsel");
  assert.match(many.detail, /\+2 weitere$/);
});

test("sameDay compares calendar days, not timestamps", () => {
  assert.equal(sameDay("2026-09-16T08:00:00", "2026-09-16T23:00:00"), true);
  assert.equal(sameDay("2026-09-16", "2026-09-17"), false);
  assert.equal(sameDay(null, null), true);
  assert.equal(sameDay(null, "2026-09-16"), false);
});

test("ticketToSnapshot trims the title and keeps the scopes", () => {
  const row = ticketToSnapshot(
    {
      issueId: 1,
      status: 11,
      briefDescription: "x".repeat(300),
      dueDate: "2026-09-20T00:00:00",
    },
    ["allNew"],
    "2026-09-16T07:00:00"
  );
  assert.equal(row.briefDescription.length, 200);
  assert.equal(row.dueDate, "2026-09-20");
  assert.deepEqual(row.scopes, ["allNew"]);
  assert.equal(row.lastCustomerAt, "2026-09-16T07:00:00");
});
