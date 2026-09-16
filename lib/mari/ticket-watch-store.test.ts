import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadStore() {
  process.env.WORKBUDDY_SESSION_SECRET =
    "a-secure-test-secret-with-more-than-32-characters";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-watch-"));
  process.env.DATABASE_PATH = path.join(tmp, "test.sqlite");
  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  return import("./ticket-watch-store.ts");
}

test("starring and unstarring a ticket round-trips", async () => {
  const store = await loadStore();
  assert.equal(store.isTicketWatched(1, 4711), false);

  const on = store.setTicketWatched(1, 4711, true, "Beleg lässt sich nicht buchen");
  assert.deepEqual(on, { watched: true, count: 1, limitHit: false });
  assert.equal(store.isTicketWatched(1, 4711), true);
  assert.deepEqual(store.listWatchedTicketIds(1), [4711]);

  const off = store.setTicketWatched(1, 4711, false);
  assert.deepEqual(off, { watched: false, count: 0, limitHit: false });
  assert.equal(store.isTicketWatched(1, 4711), false);
});

test("starring twice does not duplicate the entry", async () => {
  const store = await loadStore();
  store.setTicketWatched(1, 4711, true, "A");
  const again = store.setTicketWatched(1, 4711, true, "A");
  assert.equal(again.count, 1);
});

test("watch lists are per user", async () => {
  const store = await loadStore();
  store.setTicketWatched(1, 4711, true);
  assert.equal(store.isTicketWatched(2, 4711), false);
  assert.deepEqual(store.listWatchedTicketIds(2), []);
});

test("the hard MARI limit of 40 is reported rather than silently ignored", async () => {
  // buildTicketWhereClauses schneidet issueIds auf 40 ab — ein 41. Stern würde
  // sonst gesetzt, aber nie eine Meldung erzeugen.
  const store = await loadStore();
  for (let i = 1; i <= store.MARI_TICKET_WATCH_MAX; i += 1) {
    assert.equal(store.setTicketWatched(1, i, true).watched, true, `#${i}`);
  }
  const overflow = store.setTicketWatched(1, 999, true);
  assert.equal(overflow.watched, false);
  assert.equal(overflow.limitHit, true);
  assert.equal(overflow.count, store.MARI_TICKET_WATCH_MAX);
  assert.equal(store.isTicketWatched(1, 999), false);

  // Ein bereits beobachtetes Ticket darf am Limit weiterhin aktualisiert werden.
  const existing = store.setTicketWatched(1, 1, true, "Neuer Titel");
  assert.equal(existing.watched, true);
  assert.equal(existing.limitHit, false);
});

test("invalid ids are rejected without touching the list", async () => {
  const store = await loadStore();
  store.setTicketWatched(1, 4711, true);
  assert.equal(store.setTicketWatched(1, 0, true).watched, false);
  assert.equal(store.setTicketWatched(1, -5, true).watched, false);
  assert.deepEqual(store.listWatchedTicketIds(1), [4711]);
});

test("attachMariTicketWatchFlags marks the right rows", async () => {
  const store = await loadStore();
  store.setTicketWatched(1, 4711, true);
  const rows = store.attachMariTicketWatchFlags(1, [
    { issueId: 4711 },
    { issueId: 4712 },
  ]);
  assert.deepEqual(
    rows.map((r) => r.watched),
    [true, false]
  );
  // Ohne Benutzer (env-Admin) ist nichts beobachtet, statt zu werfen.
  const anon = store.attachMariTicketWatchFlags(null, [{ issueId: 4711 }]);
  assert.equal(anon[0]!.watched, false);
});
