import { mariSql, requireMariConfig, MariApiError } from "@/lib/mari/client";
import { sanitizeMariProjectNumber } from "@/lib/mari/timekeeping-shared";
import {
  mergeMariCompanyOptions,
  parseMariCompanyId,
  type MariCompanyOption,
} from "@/lib/mari/companies-shared";

export {
  companyFromMariIssue,
  formatMariCompanyLabel,
  mergeMariCompanyOptions,
  parseMariCompanyId,
  type MariCompanyOption,
} from "@/lib/mari/companies-shared";

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function mapCompanyRows(
  rows: Array<{ id?: unknown; name?: unknown; Company?: unknown; Name?: unknown }>
): MariCompanyOption[] {
  const out: MariCompanyOption[] = [];
  const seen = new Set<number>();
  for (const r of rows) {
    const id = parseMariCompanyId(r.id ?? r.Company);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    const name = String(r.name ?? r.Name ?? "").trim();
    out.push({ id, name: name || `Mandant ${id}` });
  }
  return out;
}

async function trySql<T extends Record<string, unknown>>(
  sql: string
): Promise<T[] | null> {
  try {
    return await mariSql<T>(sql);
  } catch {
    return null;
  }
}

const COMPANY_LIST_TTL_MS = 120_000;
let companyListCache: { at: number; rows: MariCompanyOption[] } | null = null;
let companyListInflight: Promise<MariCompanyOption[]> | null = null;

/**
 * Alle Mandanten der MARI-Verbindung: MPSysConnections plus Distinct
 * Company aus Projektstamm und Tickets (REST-Listen sind oft nur der Login-Mandant).
 */
export async function listMariCompanies(): Promise<MariCompanyOption[]> {
  requireMariConfig();
  if (
    companyListCache &&
    Date.now() - companyListCache.at < COMPANY_LIST_TTL_MS
  ) {
    return companyListCache.rows;
  }
  if (companyListInflight) return companyListInflight;

  companyListInflight = loadMariCompanies()
    .then((rows) => {
      companyListCache = { at: Date.now(), rows };
      return rows;
    })
    .finally(() => {
      companyListInflight = null;
    });
  return companyListInflight;
}

async function loadMariCompanies(): Promise<MariCompanyOption[]> {
  const connectionQueries = [
    `SELECT TOP 40 c."ID" AS "id", COALESCE(c."Name", c."CompanyName", c."Description", c."DatabaseName") AS "name"
FROM "MPSysConnections" c
ORDER BY c."ID"`,
    `SELECT TOP 40 c."CompanyID" AS "id", COALESCE(c."CompanyName", c."Name", c."Description") AS "name"
FROM "MPSysConnections" c
ORDER BY c."CompanyID"`,
    `SELECT TOP 40 c."ConnectionID" AS "id", COALESCE(c."Name", c."CompanyName") AS "name"
FROM "MPSysConnections" c
ORDER BY c."ConnectionID"`,
  ];
  let fromConnections: MariCompanyOption[] = [];
  for (const sql of connectionQueries) {
    const rows = await trySql<{ id: unknown; name: unknown }>(sql);
    if (rows && rows.length > 0) {
      fromConnections = mapCompanyRows(rows);
      if (fromConnections.length > 0) break;
    }
  }

  const distinctCompanyQueries = [
    `SELECT TOP 40 p."Company" AS "id"
FROM "MARIProject" p
WHERE p."Company" IS NOT NULL AND p."Company" > 0
GROUP BY p."Company"
ORDER BY p."Company"`,
    `SELECT TOP 40 p."Company" AS "id"
FROM "MARIProjects" p
WHERE p."Company" IS NOT NULL AND p."Company" > 0
GROUP BY p."Company"
ORDER BY p."Company"`,
    `SELECT TOP 40 p."Company" AS "id"
FROM "OPRJ" p
WHERE p."Company" IS NOT NULL AND p."Company" > 0
GROUP BY p."Company"
ORDER BY p."Company"`,
    `SELECT TOP 40 i."Company" AS "id"
FROM "MARISupportIssue" i
WHERE i."Company" IS NOT NULL
  AND i."Company" > 0
GROUP BY i."Company"
ORDER BY COUNT(*) DESC`,
  ];
  const fromDistinct: MariCompanyOption[][] = [];
  for (const sql of distinctCompanyQueries) {
    const rows = await trySql<{ id: unknown }>(sql);
    if (rows && rows.length > 0) {
      fromDistinct.push(mapCompanyRows(rows));
    }
  }

  return mergeMariCompanyOptions([fromConnections, ...fromDistinct]);
}

async function companyFromProjectMaster(
  pn: string
): Promise<number | null> {
  const queries = [
    `SELECT TOP 1 p."Company" AS "Company"
FROM "MARIProject" p
WHERE p."ProjectNumber" = ${sqlQuote(pn)}
  AND p."Company" IS NOT NULL
  AND p."Company" > 0`,
    `SELECT TOP 1 p."Company" AS "Company"
FROM "MARIProjects" p
WHERE p."ProjectNumber" = ${sqlQuote(pn)}
  AND p."Company" IS NOT NULL
  AND p."Company" > 0`,
    `SELECT TOP 1 p."Company" AS "Company"
FROM "OPRJ" p
WHERE p."PrjCode" = ${sqlQuote(pn)}
  AND p."Company" IS NOT NULL
  AND p."Company" > 0`,
  ];
  for (const sql of queries) {
    const rows = await trySql<{ Company: unknown }>(sql);
    const id = parseMariCompanyId(rows?.[0]?.Company);
    if (id != null) return id;
  }
  return null;
}

async function companyFromTickets(pn: string): Promise<number | null> {
  const rows = await trySql<{ Company: unknown }>(
    `SELECT TOP 1 i."Company" AS "Company"
FROM "MARISupportIssue" i
WHERE i."ProjectNumber" = ${sqlQuote(pn)}
  AND i."Company" IS NOT NULL
  AND i."Company" > 0
GROUP BY i."Company"
ORDER BY COUNT(*) DESC`
  );
  return parseMariCompanyId(rows?.[0]?.Company);
}

/**
 * Mandant zur Projektnummer:
 * 1) Projektstamm (MARIProject / OPRJ), falls Company-Spalte da
 * 2) häufigstes Company auf Support-Tickets zu dieser PN
 */
export async function lookupMariCompanyForProject(
  projectNumberRaw: string
): Promise<number | null> {
  requireMariConfig();
  const pn = sanitizeMariProjectNumber(projectNumberRaw);
  if (!pn) return null;
  const fromMaster = await companyFromProjectMaster(pn);
  if (fromMaster != null) return fromMaster;
  return companyFromTickets(pn);
}

export { MariApiError };
