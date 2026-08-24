/**
 * Cluster the next 90 days of connected calendars for 3dclay art coverage.
 * Prints title/location frequencies only — no tokens, no secrets.
 *
 *   node --env-file=.env --import tsx scripts/crawl-calendar-art.ts
 */
import { resolveEventArt } from "../lib/calendar/event-art";
import { getDb } from "../lib/db/client";
import { listGoogleAgendaInRange } from "../lib/google/calendars";
import { hasGoogleCalendarScope, isGoogleMailConnected } from "../lib/google/oauth";
import { listMicrosoftAgendaInRange } from "../lib/microsoft/calendars";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "../lib/microsoft/oauth";
import { addDaysYmd, zurichYmd } from "../lib/microsoft/time";

type Row = {
  provider: "microsoft" | "google";
  title: string;
  location: string | null;
  meetUrl: string | null;
  calendarType: string | null;
  calendarName: string | null;
  date: string;
};

function norm(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function titleKey(title: string): string {
  return norm(title)
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countMap(items: string[]): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item || "(leer)";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "de"));
}

async function loadUserEvents(userId: number): Promise<{
  microsoft: boolean;
  google: boolean;
  events: Row[];
}> {
  const start = zurichYmd();
  const end = addDaysYmd(start, 89);
  const events: Row[] = [];
  const microsoft =
    isMicrosoftConnected(userId) && hasMicrosoftCalendarScope(userId);
  const google = isGoogleMailConnected(userId) && hasGoogleCalendarScope(userId);

  if (microsoft) {
    const { events: rows } = await listMicrosoftAgendaInRange(userId, start, end);
    for (const e of rows) {
      events.push({
        provider: "microsoft",
        title: norm(e.summary) || "(ohne Titel)",
        location: e.location,
        meetUrl: e.meetUrl,
        calendarType: e.type,
        calendarName: e.calendarName,
        date: e.date,
      });
    }
  }

  if (google) {
    const { events: rows } = await listGoogleAgendaInRange(userId, start, end);
    for (const e of rows) {
      events.push({
        provider: "google",
        title: norm(e.summary) || "(ohne Titel)",
        location: e.location,
        meetUrl: e.meetUrl,
        calendarType: e.type,
        calendarName: e.calendarName,
        date: e.date,
      });
    }
  }

  return { microsoft, google, events };
}

async function main() {
  const start = zurichYmd();
  const end = addDaysYmd(start, 89);
  const users = getDb()
    .prepare(`SELECT id, username FROM users WHERE active = 1 ORDER BY id`)
    .all() as Array<{ id: number; username: string }>;

  if (users.length === 0) {
    console.error("Kein aktiver User in der lokalen Datenbank.");
    process.exit(2);
  }

  console.log(`Fenster ${start} … ${end} (90 Tage, Europe/Zurich)`);

  let total = 0;
  const unmatched: Row[] = [];
  const rightIds: string[] = [];
  const leftIds: string[] = [];

  for (const user of users) {
    const loaded = await loadUserEvents(user.id);
    console.log(
      `User #${user.id} ${user.username}: Microsoft=${loaded.microsoft ? "ja" : "nein"} Google=${loaded.google ? "ja" : "nein"} Events=${loaded.events.length}`
    );
    if (!loaded.microsoft && !loaded.google) {
      continue;
    }
    total += loaded.events.length;
    for (const event of loaded.events) {
      const art = resolveEventArt({
        title: event.title,
        location: event.location,
        meetUrl: event.meetUrl,
        calendarType: event.calendarType,
        calendarName: event.calendarName,
      });
      rightIds.push(art.right.id);
      leftIds.push(art.left?.id || "(keine)");
      if (art.right.id === "default") unmatched.push(event);
    }
  }

  if (total === 0) {
    console.error(
      "Keine Termine. Bitte anmelden und Microsoft- oder Google-Kalender verbinden."
    );
    process.exit(3);
  }

  console.log(`\nTermine gesamt: ${total}`);
  console.log("\nRechte Grafik:");
  for (const row of countMap(rightIds)) {
    console.log(`  ${row.count}\t${row.key}`);
  }
  console.log("\nLinke Grafik:");
  for (const row of countMap(leftIds)) {
    console.log(`  ${row.count}\t${row.key}`);
  }

  const titleRows = countMap(unmatched.map((e) => titleKey(e.title)));
  console.log(`\nFallback-Titel (default), unique=${titleRows.length}:`);
  for (const row of titleRows.slice(0, 80)) {
    const sample = unmatched.find((e) => titleKey(e.title) === row.key);
    const loc = norm(sample?.location);
    const meet = sample?.meetUrl ? "meet" : "";
    const type = sample?.calendarType || "";
    console.log(
      `  ${row.count}\t${row.key}${loc ? `  | loc=${loc}` : ""}${meet ? `  | ${meet}` : ""}${type ? `  | type=${type}` : ""}`
    );
  }

  const locations = countMap(
    unmatched.map((e) => norm(e.location).toLowerCase()).filter(Boolean)
  );
  console.log("\nFallback-Orte:");
  for (const row of locations.slice(0, 30)) {
    console.log(`  ${row.count}\t${row.key}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
