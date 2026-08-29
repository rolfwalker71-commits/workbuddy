import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTicketsByTextQuery,
  parseIssueIdsParam,
  parseTicketNumberQuery,
  shouldLookupTicketNumber,
} from "./ticket-search-shared.ts";

test("parseTicketNumberQuery accepts digits with or without #", () => {
  assert.equal(parseTicketNumberQuery("144078"), 144078);
  assert.equal(parseTicketNumberQuery("#144078"), 144078);
  assert.equal(parseTicketNumberQuery("  #144078  "), 144078);
});

test("shouldLookupTicketNumber waits for a complete ticket id", () => {
  assert.equal(shouldLookupTicketNumber("14"), false);
  assert.equal(shouldLookupTicketNumber("144"), false);
  assert.equal(shouldLookupTicketNumber("144078"), true);
  assert.equal(shouldLookupTicketNumber("#144078"), true);
});

test("parseTicketNumberQuery rejects employee numbers and mixed text", () => {
  assert.equal(parseTicketNumberQuery("M1010"), null);
  assert.equal(parseTicketNumberQuery("M2055"), null);
  assert.equal(parseTicketNumberQuery("Rechnung 144078"), null);
  assert.equal(parseTicketNumberQuery(""), null);
  assert.equal(parseTicketNumberQuery("#"), null);
  assert.equal(parseTicketNumberQuery("0"), null);
});

test("parseIssueIdsParam splits unique positive ids", () => {
  assert.deepEqual(parseIssueIdsParam("144078,#144168,144078"), [
    144078,
    144168,
  ]);
  assert.deepEqual(parseIssueIdsParam("M1010,foo"), []);
});

test("filterTicketsByTextQuery matches subject and customer in the current set", () => {
  const tickets = [
    {
      issueId: 144649,
      briefDescription: "Rechnung ANG",
      addressMatchcode: "Bübchen",
      cardCode: "C100",
    },
    {
      issueId: 144168,
      briefDescription: "Login hängt",
      addressMatchcode: "Applikation CH",
      cardCode: "C200",
    },
  ];
  assert.equal(filterTicketsByTextQuery(tickets, "rechnung").length, 1);
  assert.equal(filterTicketsByTextQuery(tickets, "C200")[0]?.issueId, 144168);
  assert.equal(filterTicketsByTextQuery(tickets, "1446")[0]?.issueId, 144649);
});
