import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-projectlist-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  // getDb() hält die Verbindung prozessweit; ein neuer Modul-Import allein gibt
  // jedem Fall sonst dieselbe Datei und damit die Daten des vorigen Tests.
  const { resetDbForTests } = await import("../db/client.ts");
  resetDbForTests();
  const mod = await import(`./project-list-cache.ts?case=${Math.random()}`);
  return mod as typeof import("./project-list-cache.ts");
}

const PROJECTS = [
  {
    matchcode: "ANG Projekte - Homepage",
    keyVisible: "P300006",
    keyInternal: "P300006",
    indent: 0,
    indentParent: false,
    company: 1,
  },
];

test("eine geschriebene Liste kommt unverändert zurück", async () => {
  const cache = await loadCache();
  cache.writeCachedProjectList("4711", PROJECTS);
  assert.deepEqual(cache.readCachedProjectList("4711"), PROJECTS);
});

test("eine unbekannte Personalnummer liefert null", async () => {
  const cache = await loadCache();
  assert.equal(cache.readCachedProjectList("9999"), null);
});

test("eine leere Liste wird nicht zementiert", async () => {
  const cache = await loadCache();
  // Sonst würde ein MARI-Fehlschlag als "dieser Mitarbeiter hat keine Projekte"
  // festgeschrieben, und zwar für die volle TTL.
  cache.writeCachedProjectList("4711", []);
  assert.equal(cache.readCachedProjectList("4711"), null);
});

test("jenseits der TTL gilt der Eintrag als nicht vorhanden", async () => {
  const cache = await loadCache();
  const longAgo = Date.now() - cache.PROJECT_LIST_TTL_MS - 60_000;
  cache.writeCachedProjectList("4711", PROJECTS, longAgo);
  assert.equal(cache.readCachedProjectList("4711"), null);
});

test("der Hintergrund-Job frischt erst ab der Refresh-Schwelle auf", async () => {
  const cache = await loadCache();
  const now = Date.now();
  cache.writeCachedProjectList("4711", PROJECTS, now);
  assert.equal(cache.projectListNeedsRefresh("4711", now), false);
  assert.equal(
    cache.projectListNeedsRefresh("4711", now + cache.PROJECT_LIST_REFRESH_MS),
    true
  );
  // Noch nie geholt heisst: sofort holen.
  assert.equal(cache.projectListNeedsRefresh("9999", now), true);
});

test("ein zweiter Schreibvorgang ersetzt den Eintrag", async () => {
  const cache = await loadCache();
  cache.writeCachedProjectList("4711", PROJECTS);
  const next = [{ ...PROJECTS[0]!, matchcode: "Umbenannt" }];
  cache.writeCachedProjectList("4711", next);
  assert.equal(cache.readCachedProjectList("4711")?.[0]?.matchcode, "Umbenannt");
});

test("vergessen entfernt den Eintrag", async () => {
  const cache = await loadCache();
  cache.writeCachedProjectList("4711", PROJECTS);
  cache.forgetCachedProjectList("4711");
  assert.equal(cache.readCachedProjectList("4711"), null);
});
