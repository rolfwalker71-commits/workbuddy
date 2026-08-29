import { mariSql, requireMariConfig, MariApiError } from "@/lib/mari/client";

export type MariCustomerOption = {
  cardCode: string;
  name: string;
};

/** SAP B1: C… = Kunde, V…/S… = Lieferant. */
export function isMariCustomerCardCode(
  cardCode: string | null | undefined
): boolean {
  const v = (cardCode || "").trim();
  return v.length > 0 && /^C/i.test(v);
}

/**
 * Ein Vertrag/Projekt gehört zu genau einem Kunden.
 * Ticket-Historie kann denselben CardCode doppelt und Lieferanten (V…) mitliefern.
 */
export function pickMariProjectCustomer(
  rows: MariCustomerOption[]
): MariCustomerOption | null {
  const unique: MariCustomerOption[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const cardCode = normalizeMariCardCode(r.cardCode);
    if (!cardCode) continue;
    const key = cardCode.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      cardCode,
      name: (r.name || "").trim() || cardCode,
    });
  }
  return unique.find((c) => isMariCustomerCardCode(c.cardCode)) || null;
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Strip user wildcards (*, %) — we always do contains-match. */
export function normalizeCustomerSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^[*％%]+/, "")
    .replace(/[*％%]+$/, "")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sqlLikeContains(raw: string): string {
  const escaped = raw.replace(/'/g, "''").replace(/[%_]/g, " ");
  return sqlQuote(`%${escaped}%`);
}

/**
 * BP CardCode — allow typical B1 codes; reject separators used in query lists.
 */
export function normalizeMariCardCode(
  raw: string | null | undefined
): string | null {
  const v = (raw || "").trim();
  if (!v || v.length > 50) return null;
  if (/[,\n\r]/.test(v)) return null;
  return v;
}

export function parseCardCodesParam(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((p) => normalizeMariCardCode(p))
        .filter((c): c is string => c != null)
    ),
  ].slice(0, 40);
}

function mapCustomerRows(
  rows: Array<{ CardCode: string | null; Name: string | null }>
): MariCustomerOption[] {
  const out: MariCustomerOption[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const cardCode = normalizeMariCardCode(r.CardCode);
    if (!cardCode) continue;
    const key = cardCode.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (r.Name || "").trim() || cardCode;
    out.push({ cardCode, name });
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

/**
 * Support-Kunden aus Tickets (AddressMatchcode / CardCode) —
 * unabhängig vom Bearbeiter. Primäre Quelle für die UI-Suche.
 */
async function searchCustomersFromIssues(
  q: string,
  limit: number
): Promise<MariCustomerOption[]> {
  const pattern = sqlLikeContains(q);
  const rows = await mariSql<{
    CardCode: string | null;
    Name: string | null;
  }>(
    `SELECT TOP ${limit}
  i."CardCode" AS "CardCode",
  MAX(i."AddressMatchcode") AS "Name"
FROM "MARISupportIssue" i
WHERE i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."CardCode" IS NOT NULL
  AND i."CardCode" <> ''
  AND (
    LOWER(i."CardCode") LIKE LOWER(${pattern})
    OR LOWER(COALESCE(i."AddressMatchcode", '')) LIKE LOWER(${pattern})
  )
GROUP BY i."CardCode"
ORDER BY MAX(i."AddressMatchcode"), i."CardCode"`
  );
  return mapCustomerRows(rows);
}

async function searchCustomersFromOcrd(
  q: string,
  limit: number
): Promise<MariCustomerOption[]> {
  const pattern = sqlLikeContains(q);
  const rows = await mariSql<{
    CardCode: string | null;
    Name: string | null;
  }>(
    `SELECT TOP ${limit}
  c."CardCode" AS "CardCode",
  c."CardName" AS "Name"
FROM "OCRD" c
WHERE (
    LOWER(c."CardCode") LIKE LOWER(${pattern})
    OR LOWER(COALESCE(c."CardName", '')) LIKE LOWER(${pattern})
  )
ORDER BY c."CardName", c."CardCode"`
  );
  return mapCustomerRows(rows);
}

function mergeCustomers(
  primary: MariCustomerOption[],
  secondary: MariCustomerOption[],
  limit: number
): MariCustomerOption[] {
  const seen = new Set(primary.map((c) => c.cardCode));
  const out = [...primary];
  for (const c of secondary) {
    if (seen.has(c.cardCode)) continue;
    seen.add(c.cardCode);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/**
 * Teilqualifizierte Kundensuche (CardCode / Matchcode / Name).
 * Primär aus Support-Tickets (alle Bearbeiter), ergänzend OCRD.
 */
export async function searchMariCustomers(
  query: string,
  options?: { limit?: number }
): Promise<MariCustomerOption[]> {
  requireMariConfig();
  const q = normalizeCustomerSearchQuery(query);
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 50);

  let fromIssues: MariCustomerOption[] = [];
  try {
    fromIssues = await searchCustomersFromIssues(q, limit);
  } catch (err) {
    console.warn(
      "[mari] issue customer search failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  let fromMaster: MariCustomerOption[] = [];
  try {
    fromMaster = await searchCustomersFromOcrd(q, limit);
  } catch (err) {
    console.warn(
      "[mari] OCRD customer search failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  return mergeCustomers(fromIssues, fromMaster, limit);
}

export async function getMariCustomerByCardCode(
  cardCode: string
): Promise<MariCustomerOption | null> {
  const code = normalizeMariCardCode(cardCode);
  if (!code) return null;
  const hits = await searchMariCustomers(code, { limit: 15 });
  return (
    hits.find((h) => h.cardCode.toLowerCase() === code.toLowerCase()) ||
    hits[0] ||
    null
  );
}

/** Absender-E-Mail für OCRD/OCPR/Ticket-Lookup. */
export function normalizeMariEmail(
  raw: string | null | undefined
): string | null {
  const v = (raw || "").trim().toLowerCase();
  if (!v || v.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  if (/[;'"\\]/.test(v)) return null;
  return v;
}

export type MariProjectHint = {
  projectNumber: string;
  projectLabel: string | null;
  contractId: number | null;
};

export type MariEmailPartnerSuggestion = {
  cardCode: string;
  name: string;
  contactName: string | null;
  source: "ocrd" | "ocpr" | "issue";
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
};

function splitContactPersonName(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const parts = t.split(";").map((p) => p.trim()).filter(Boolean);
  const name = parts.find((p) => !p.includes("@"));
  return name || null;
}

async function listProjectsForCardCode(
  cardCode: string,
  limit = 8
): Promise<MariProjectHint[]> {
  const { sanitizeMariProjectNumber } = await import(
    "@/lib/mari/timekeeping-shared"
  );
  const rows = await mariSql<{
    ProjectNumber: string | null;
    Name: string | null;
    ContractID: number | null;
  }>(
    `SELECT TOP ${limit}
  i."ProjectNumber" AS "ProjectNumber",
  MAX(i."AddressMatchcode") AS "Name",
  MAX(i."ContractID") AS "ContractID"
FROM "MARISupportIssue" i
WHERE i."CardCode" = ${sqlQuote(cardCode)}
  AND i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."ProjectNumber" IS NOT NULL
  AND i."ProjectNumber" <> ''
GROUP BY i."ProjectNumber"
ORDER BY MAX(i."RequestDate") DESC`
  );
  const out: MariProjectHint[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const pn = sanitizeMariProjectNumber(r.ProjectNumber, { cardCode });
    if (!pn || seen.has(pn)) continue;
    seen.add(pn);
    const cid = Number(r.ContractID);
    out.push({
      projectNumber: pn,
      projectLabel: (r.Name || "").trim() || null,
      contractId: Number.isInteger(cid) && cid > 0 ? cid : null,
    });
  }
  return out;
}

async function lookupCardCodesFromOcrd(
  email: string
): Promise<Array<{ cardCode: string; name: string }>> {
  const rows = await mariSql<{
    CardCode: string | null;
    Name: string | null;
  }>(
    `SELECT TOP 20
  c."CardCode" AS "CardCode",
  c."CardName" AS "Name"
FROM "OCRD" c
WHERE LOWER(COALESCE(c."E_Mail", '')) = ${sqlQuote(email)}`
  );
  return mapCustomerRows(rows);
}

async function lookupCardCodesFromOcpr(
  email: string
): Promise<Array<{ cardCode: string; name: string; contactName: string | null }>> {
  const trySql = async (emailCol: string) =>
    mariSql<{
      CardCode: string | null;
      Name: string | null;
      ContactName: string | null;
    }>(
      `SELECT TOP 20
  p."CardCode" AS "CardCode",
  c."CardName" AS "Name",
  p."Name" AS "ContactName"
FROM "OCPR" p
LEFT JOIN "OCRD" c ON c."CardCode" = p."CardCode"
WHERE LOWER(COALESCE(p."${emailCol}", '')) = ${sqlQuote(email)}`
    );

  let rows: Array<{
    CardCode: string | null;
    Name: string | null;
    ContactName: string | null;
  }> = [];
  try {
    rows = await trySql("E_MailL");
  } catch (err) {
    console.warn(
      "[mari] OCPR E_MailL lookup failed:",
      err instanceof MariApiError ? err.message : err
    );
    try {
      rows = await trySql("E_Mail");
    } catch (err2) {
      console.warn(
        "[mari] OCPR E_Mail lookup failed:",
        err2 instanceof MariApiError ? err2.message : err2
      );
      return [];
    }
  }
  const out: Array<{
    cardCode: string;
    name: string;
    contactName: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const cardCode = normalizeMariCardCode(r.CardCode);
    if (!cardCode || seen.has(cardCode)) continue;
    seen.add(cardCode);
    out.push({
      cardCode,
      name: (r.Name || "").trim() || cardCode,
      contactName: (r.ContactName || "").trim() || null,
    });
  }
  return out;
}

async function lookupCardCodesFromIssues(
  email: string
): Promise<
  Array<{
    cardCode: string;
    name: string;
    contactName: string | null;
    projectNumber: string | null;
    contractId: number | null;
  }>
> {
  const { sanitizeMariProjectNumber } = await import(
    "@/lib/mari/timekeeping-shared"
  );
  const pattern = sqlLikeContains(email);
  const rows = await mariSql<{
    CardCode: string | null;
    Name: string | null;
    ContactPerson: string | null;
    ProjectNumber: string | null;
    ContractID: number | null;
  }>(
    `SELECT TOP 20
  i."CardCode" AS "CardCode",
  MAX(i."AddressMatchcode") AS "Name",
  MAX(i."ContactPerson") AS "ContactPerson",
  i."ProjectNumber" AS "ProjectNumber",
  MAX(i."ContractID") AS "ContractID"
FROM "MARISupportIssue" i
WHERE i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."CardCode" IS NOT NULL
  AND i."CardCode" <> ''
  AND LOWER(COALESCE(i."ContactPerson", '')) LIKE LOWER(${pattern})
GROUP BY i."CardCode", i."ProjectNumber"
ORDER BY MAX(i."RequestDate") DESC`
  );
  return rows
    .map((r) => {
      const cardCode = normalizeMariCardCode(r.CardCode);
      if (!cardCode) return null;
      const cid = Number(r.ContractID);
      return {
        cardCode,
        name: (r.Name || "").trim() || cardCode,
        contactName: splitContactPersonName(r.ContactPerson),
        projectNumber: sanitizeMariProjectNumber(r.ProjectNumber, {
          cardCode,
          addressMatchcode: r.Name,
        }),
        contractId: Number.isInteger(cid) && cid > 0 ? cid : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}

function pushSuggestion(
  out: MariEmailPartnerSuggestion[],
  seen: Set<string>,
  row: MariEmailPartnerSuggestion
) {
  const key = `${row.cardCode}::${row.projectNumber || ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(row);
}

/**
 * Geschäftspartner + Projekte zur Absender-E-Mail (OCRD, OCPR, Ticket-Historie).
 * Nur Vorschläge — die UI bestätigt immer.
 */
export async function lookupMariPartnersByEmail(
  rawEmail: string
): Promise<MariEmailPartnerSuggestion[]> {
  requireMariConfig();
  const email = normalizeMariEmail(rawEmail);
  if (!email) return [];

  const seen = new Set<string>();
  const out: MariEmailPartnerSuggestion[] = [];

  try {
    const fromOcrd = await lookupCardCodesFromOcrd(email);
    for (const c of fromOcrd) {
      let projects: MariProjectHint[] = [];
      try {
        projects = await listProjectsForCardCode(c.cardCode);
      } catch {
        projects = [];
      }
      if (projects.length === 0) {
        pushSuggestion(out, seen, {
          cardCode: c.cardCode,
          name: c.name,
          contactName: null,
          source: "ocrd",
          projectNumber: null,
          projectLabel: null,
          contractId: null,
        });
        continue;
      }
      for (const p of projects) {
        pushSuggestion(out, seen, {
          cardCode: c.cardCode,
          name: c.name,
          contactName: null,
          source: "ocrd",
          projectNumber: p.projectNumber,
          projectLabel: p.projectLabel,
          contractId: p.contractId,
        });
      }
    }
  } catch (err) {
    console.warn(
      "[mari] OCRD email lookup failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  try {
    const fromOcpr = await lookupCardCodesFromOcpr(email);
    for (const c of fromOcpr) {
      let projects: MariProjectHint[] = [];
      try {
        projects = await listProjectsForCardCode(c.cardCode);
      } catch {
        projects = [];
      }
      if (projects.length === 0) {
        pushSuggestion(out, seen, {
          cardCode: c.cardCode,
          name: c.name,
          contactName: c.contactName,
          source: "ocpr",
          projectNumber: null,
          projectLabel: null,
          contractId: null,
        });
        continue;
      }
      for (const p of projects) {
        pushSuggestion(out, seen, {
          cardCode: c.cardCode,
          name: c.name,
          contactName: c.contactName,
          source: "ocpr",
          projectNumber: p.projectNumber,
          projectLabel: p.projectLabel,
          contractId: p.contractId,
        });
      }
    }
  } catch (err) {
    console.warn(
      "[mari] OCPR email lookup failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  try {
    const fromIssues = await lookupCardCodesFromIssues(email);
    for (const c of fromIssues) {
      pushSuggestion(out, seen, {
        cardCode: c.cardCode,
        name: c.name,
        contactName: c.contactName,
        source: "issue",
        projectNumber: c.projectNumber,
        projectLabel: c.name,
        contractId: c.contractId,
      });
    }
  } catch (err) {
    console.warn(
      "[mari] issue email lookup failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  return out.slice(0, 20);
}

async function customerFromProjectMaster(
  pn: string
): Promise<MariCustomerOption | null> {
  const queries = [
    `SELECT TOP 1 p."CardCode" AS "CardCode",
  COALESCE(p."CardName", p."AddressMatchcode", p."Name") AS "Name"
FROM "MARIProject" p
WHERE p."ProjectNumber" = ${sqlQuote(pn)}
  AND p."CardCode" IS NOT NULL
  AND p."CardCode" <> ''`,
    `SELECT TOP 1 p."CardCode" AS "CardCode",
  COALESCE(p."CardName", p."Name") AS "Name"
FROM "MARIProjects" p
WHERE p."ProjectNumber" = ${sqlQuote(pn)}
  AND p."CardCode" IS NOT NULL
  AND p."CardCode" <> ''`,
    `SELECT TOP 1 p."CardCode" AS "CardCode",
  COALESCE(c."CardName", p."PrjName") AS "Name"
FROM "OPRJ" p
LEFT JOIN "OCRD" c ON c."CardCode" = p."CardCode"
WHERE p."PrjCode" = ${sqlQuote(pn)}
  AND p."CardCode" IS NOT NULL
  AND p."CardCode" <> ''`,
  ];
  for (const sql of queries) {
    const rows = await trySql<{ CardCode: string | null; Name: string | null }>(
      sql
    );
    const picked = pickMariProjectCustomer(mapCustomerRows(rows || []));
    if (picked) return picked;
  }
  return null;
}

async function customerFromProjectTickets(
  pn: string
): Promise<MariCustomerOption | null> {
  const rows = await trySql<{
    CardCode: string | null;
    Name: string | null;
  }>(
    `SELECT TOP 10
  i."CardCode" AS "CardCode",
  MAX(i."AddressMatchcode") AS "Name"
FROM "MARISupportIssue" i
WHERE i."ProjectNumber" = ${sqlQuote(pn)}
  AND i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."CardCode" IS NOT NULL
  AND i."CardCode" <> ''
GROUP BY i."CardCode"
ORDER BY COUNT(*) DESC`
  );
  return pickMariProjectCustomer(mapCustomerRows(rows || []));
}

/**
 * Kunde zum Projekt: Stamm (MARIProject / OPRJ), sonst häufigster C-CardCode
 * aus der Ticket-Historie. Lieferanten (V…) und Duplikate entfallen.
 */
export async function lookupMariCustomersForProject(
  projectNumberRaw: string
): Promise<MariCustomerOption[]> {
  requireMariConfig();
  const { sanitizeMariProjectNumber } = await import(
    "@/lib/mari/timekeeping-shared"
  );
  const pn = sanitizeMariProjectNumber(projectNumberRaw);
  if (!pn) return [];
  const fromMaster = await customerFromProjectMaster(pn);
  if (fromMaster) return [fromMaster];
  const fromTickets = await customerFromProjectTickets(pn);
  return fromTickets ? [fromTickets] : [];
}
