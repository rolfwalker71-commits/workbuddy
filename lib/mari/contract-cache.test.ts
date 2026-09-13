import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-contracts-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  // getDb() hält die Verbindung prozessweit; ohne Reset sieht der Test, der den
  // kalten Cache prüft, die Daten des vorigen Tests.
  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const mod = await import(`./contract-cache.ts?case=${Math.random()}`);
  return mod as typeof import("./contract-cache.ts");
}

const CONTRACTS = [
  {
    contractId: 100006,
    contractNumber: "V30000100",
    projectNumber: "P300001",
    description: "Infrastruktur Intern",
    company: 1,
    inactive: false,
  },
  {
    contractId: 100597,
    contractNumber: "V00100380",
    projectNumber: "P300001",
    description: "Sonnberg prüf nach",
    company: 1,
    inactive: true,
  },
];

const POSITIONS = [
  {
    positionId: 100014,
    contractId: 100006,
    position: "2",
    matchcode: "Reisezeit",
    description: "Reisezeit",
    company: 1,
    serviceNumber: "242",
    indent: 0,
    parentId: null,
  },
  {
    positionId: 100013,
    contractId: 100006,
    position: "1",
    matchcode: "Beratung",
    description: "Beratung",
    company: 1,
    serviceNumber: "222",
    indent: 0,
    parentId: null,
  },
];

test("ein Vollabzug kommt als KeyPairs zurück", async () => {
  const cache = await loadCache();
  cache.replaceMariMasterData({ contracts: CONTRACTS, positions: POSITIONS });

  const all = cache.readContractsForProject("P300001", false);
  assert.equal(all?.length, 2);
  assert.equal(all?.[0]?.keyInternal, "100597");
  assert.equal(all?.[0]?.keyVisible, "V00100380");
  assert.equal(all?.[0]?.matchcode, "Sonnberg prüf nach");
});

test("activeOnly entspricht Inactive = 0", async () => {
  const cache = await loadCache();
  cache.replaceMariMasterData({ contracts: CONTRACTS, positions: POSITIONS });
  // Gemessen: /ProjectListContracts/{pn}/true liefert exakt die Zeilen mit 0,
  // /false filtert gar nicht.
  const active = cache.readContractsForProject("P300001", true);
  assert.equal(active?.length, 1);
  assert.equal(active?.[0]?.keyInternal, "100006");
});

test("Positionen kommen in Gliederungsreihenfolge, nicht nach Id", async () => {
  const cache = await loadCache();
  cache.replaceMariMasterData({ contracts: CONTRACTS, positions: POSITIONS });
  const rows = cache.readPositionsForContract(100006);
  // Id 100014 ist Position 2, 100013 ist Position 1 — die Anzeige folgt der
  // Positionsnummer, sonst steht Reisezeit vor Beratung.
  assert.deepEqual(
    rows?.map((r) => r.keyVisible),
    ["1", "2"]
  );
  assert.equal(rows?.[0]?.matchcode, "Beratung");
});

test("solange nie synchronisiert wurde, sagt der Cache null statt leer", async () => {
  const cache = await loadCache();
  // null heisst "frag REST", eine leere Liste hiesse "es gibt keine Verträge" —
  // der Unterschied entscheidet, ob die Buchungsmaske leer bleibt.
  assert.equal(cache.readContractsForProject("P300001", true), null);
  assert.equal(cache.readPositionsForContract(100006), null);
  assert.equal(cache.mariMasterDataIsWarm(), false);
});

test("ein unbekanntes Projekt liefert leer, sobald der Cache warm ist", async () => {
  const cache = await loadCache();
  cache.replaceMariMasterData({ contracts: CONTRACTS, positions: POSITIONS });
  assert.deepEqual(cache.readContractsForProject("P999999", true), []);
  assert.deepEqual(cache.readPositionsForContract(999999), []);
});

test("ein leerer Abzug wird abgelehnt statt geschrieben", async () => {
  const cache = await loadCache();
  cache.replaceMariMasterData({ contracts: CONTRACTS, positions: POSITIONS });
  // Ein fehlgeschlagener Sync darf den Cache nicht leeren — sonst fällt jede
  // Buchungsmaske auf die serielle REST-Lane zurück.
  assert.throws(() =>
    cache.replaceMariMasterData({ contracts: [], positions: [] })
  );
  assert.equal(cache.readContractsForProject("P300001", false)?.length, 2);
});

test("ein zweiter Abzug ersetzt vollständig, statt zu ergänzen", async () => {
  const cache = await loadCache();
  cache.replaceMariMasterData({ contracts: CONTRACTS, positions: POSITIONS });
  cache.replaceMariMasterData({
    contracts: [{ ...CONTRACTS[0]!, description: "Neuer Name" }],
    positions: [],
  });
  const rows = cache.readContractsForProject("P300001", false);
  assert.equal(rows?.length, 1);
  assert.equal(rows?.[0]?.matchcode, "Neuer Name");
  assert.deepEqual(cache.readPositionsForContract(100006), []);
});

test("der Status meldet Zeilenzahl und Zeitpunkt", async () => {
  const cache = await loadCache();
  cache.replaceMariMasterData({
    contracts: CONTRACTS,
    positions: POSITIONS,
    now: Date.parse("2026-09-13T08:00:00.000Z"),
  });
  const state = cache.getMariMasterDataState();
  assert.equal(state.contracts, 2);
  assert.equal(state.positions, 2);
  assert.equal(state.syncedAt, "2026-09-13T08:00:00.000Z");
});
