import assert from "node:assert/strict";
import test from "node:test";
import { nextTicketQueueSelection } from "./ticket-queue-selection.ts";

test("keeps the open ticket after save even if it left the queue", () => {
  const next = nextTicketQueueSelection({
    selectedId: 144827,
    flyoutOpen: true,
    pinnedId: null,
    poolIds: [144900, 144901],
    searching: false,
    listLoading: false,
  });
  assert.equal(next.selectedId, 144827);
  assert.equal(next.flyoutOpen, true);
});

test("keeps the open ticket when the queue is empty after save", () => {
  const next = nextTicketQueueSelection({
    selectedId: 144827,
    flyoutOpen: true,
    pinnedId: null,
    poolIds: [],
    searching: false,
    listLoading: false,
  });
  assert.equal(next.selectedId, 144827);
  assert.equal(next.flyoutOpen, true);
});

test("auto-advances only after the user closes the ticket", () => {
  const next = nextTicketQueueSelection({
    selectedId: 144827,
    flyoutOpen: false,
    pinnedId: null,
    poolIds: [144900, 144901],
    searching: false,
    listLoading: false,
  });
  assert.equal(next.selectedId, 144900);
  assert.equal(next.flyoutOpen, false);
});

test("stays on the selected ticket when it is still in the queue", () => {
  const next = nextTicketQueueSelection({
    selectedId: 144827,
    flyoutOpen: true,
    pinnedId: 144827,
    poolIds: [144827, 144900],
    searching: false,
    listLoading: false,
  });
  assert.equal(next.selectedId, 144827);
  assert.equal(next.pinnedId, null);
});

test("selects the first queue ticket on initial load", () => {
  const next = nextTicketQueueSelection({
    selectedId: null,
    flyoutOpen: false,
    pinnedId: null,
    poolIds: [144900, 144901],
    searching: false,
    listLoading: false,
  });
  assert.equal(next.selectedId, 144900);
});

test("pinned ticket stays selected while the list is still loading empty", () => {
  const next = nextTicketQueueSelection({
    selectedId: 144827,
    flyoutOpen: false,
    pinnedId: 144827,
    poolIds: [],
    searching: false,
    listLoading: true,
  });
  assert.equal(next.selectedId, 144827);
});
