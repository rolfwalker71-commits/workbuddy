/**
 * Projektliste pro Personalnummer, persistent.
 *
 * Anders als Verträge und Positionen ist diese Liste personenbezogen: MARI
 * filtert `/api/ProjectListForTimeBooking/{Personalnummer}` nach dem Mitarbeiter,
 * und einen Projektstamm gibt es in diesem Schema nicht — `MARIProject`,
 * `MARIProjects` und `OPRJ` fehlen alle drei (`Could not find table/view … in
 * schema MARI_PROJEKTANG`). Die Liste bleibt also REST, wird aber nicht mehr nur
 * 120 s im Prozessspeicher gehalten, sondern übersteht Neustarts und Deploys.
 */

import { getDb } from "@/lib/db/client";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";

/** Obergrenze, falls der Hintergrund-Job länger nicht lief. */
export const PROJECT_LIST_TTL_MS = 12 * 60 * 60 * 1000;
/** Ab diesem Alter frischt der Scheduler den Eintrag auf. */
export const PROJECT_LIST_REFRESH_MS = 60 * 60 * 1000;

type Row = { projects_json: string; fetched_at: string };

function normalizeEmployee(employeeNumber: string): string {
  return employeeNumber.trim();
}

export function readCachedProjectList(
  employeeNumber: string,
  now = Date.now()
): MariKeyPair[] | null {
  const emp = normalizeEmployee(employeeNumber);
  if (!emp) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT projects_json, fetched_at FROM mari_project_lists
       WHERE employee_number = ?`
    )
    .get(emp) as Row | undefined;
  if (!row) return null;
  const age = now - new Date(row.fetched_at).getTime();
  if (!Number.isFinite(age) || age > PROJECT_LIST_TTL_MS) return null;
  try {
    const parsed = JSON.parse(row.projects_json) as MariKeyPair[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Eine leere Liste wird nicht geschrieben: ein Fehlschlag in MARI darf nicht als
 * "dieser Mitarbeiter hat keine Projekte" zementiert werden.
 */
export function writeCachedProjectList(
  employeeNumber: string,
  projects: readonly MariKeyPair[],
  now = Date.now()
): void {
  const emp = normalizeEmployee(employeeNumber);
  if (!emp || projects.length === 0) return;
  getDb()
    .prepare(
      `INSERT INTO mari_project_lists (employee_number, projects_json, fetched_at)
       VALUES (?, ?, ?)
       ON CONFLICT(employee_number) DO UPDATE SET
         projects_json = excluded.projects_json,
         fetched_at = excluded.fetched_at`
    )
    .run(emp, JSON.stringify(projects), new Date(now).toISOString());
}

/** Für den Hintergrund-Job: lohnt sich ein Refresh für diese Personalnummer? */
export function projectListNeedsRefresh(
  employeeNumber: string,
  now = Date.now()
): boolean {
  const emp = normalizeEmployee(employeeNumber);
  if (!emp) return false;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT fetched_at FROM mari_project_lists WHERE employee_number = ?`
    )
    .get(emp) as { fetched_at: string } | undefined;
  if (!row) return true;
  const age = now - new Date(row.fetched_at).getTime();
  return !Number.isFinite(age) || age >= PROJECT_LIST_REFRESH_MS;
}

export function forgetCachedProjectList(employeeNumber: string): void {
  const emp = normalizeEmployee(employeeNumber);
  if (!emp) return;
  getDb()
    .prepare(`DELETE FROM mari_project_lists WHERE employee_number = ?`)
    .run(emp);
}
