import { isAllowedCompanyEmail } from "@/lib/auth/allowed-email";
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

function sqlLikePrefix(raw: string): string {
  const escaped = raw.replace(/'/g, "''").replace(/[%_]/g, " ");
  return sqlQuote(`${escaped}%`);
}

/** Login-Domain (z.B. @an-group.one) — keine Kunden-Chips aus Kollegen-Mails. */
export function isInternalColleagueEmail(
  email: string | null | undefined
): boolean {
  return isAllowedCompanyEmail(email);
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
  limit: number,
  prefixOnly = false
): Promise<MariCustomerOption[]> {
  const pattern = prefixOnly ? sqlLikePrefix(q) : sqlLikeContains(q);
  const prefix = sqlLikePrefix(q);
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
ORDER BY
  CASE WHEN LOWER(MAX(i."AddressMatchcode")) LIKE LOWER(${prefix}) THEN 0 ELSE 1 END,
  MAX(i."AddressMatchcode"), i."CardCode"`
  );
  return mapCustomerRows(rows);
}

async function searchCustomersFromOcrd(
  q: string,
  limit: number,
  prefixOnly = false
): Promise<MariCustomerOption[]> {
  const pattern = prefixOnly ? sqlLikePrefix(q) : sqlLikeContains(q);
  const prefix = sqlLikePrefix(q);
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
ORDER BY
  CASE WHEN LOWER(COALESCE(c."CardName", '')) LIKE LOWER(${prefix}) THEN 0 ELSE 1 END,
  c."CardName", c."CardCode"`
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
  options?: { limit?: number; prefixOnly?: boolean }
): Promise<MariCustomerOption[]> {
  requireMariConfig();
  const q = normalizeCustomerSearchQuery(query);
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 50);
  const prefixOnly = options?.prefixOnly === true;

  let fromIssues: MariCustomerOption[] = [];
  try {
    fromIssues = await searchCustomersFromIssues(q, limit, prefixOnly);
  } catch (err) {
    console.warn(
      "[mari] issue customer search failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  let fromMaster: MariCustomerOption[] = [];
  try {
    fromMaster = await searchCustomersFromOcrd(q, limit, prefixOnly);
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
  source: "ocrd" | "ocpr" | "issue" | "title";
  projectNumber: string | null;
  projectLabel: string | null;
  contractId: number | null;
  /** Outlook-Teilnehmer, der diesen Treffer ausgelöst hat. */
  matchedEmail?: string | null;
  /** Kurz warum der Chip da ist (Betreff-Token oder Teilnehmer-Mail). */
  reason?: string | null;
};

export type MariEventTitleSuggestResult = {
  suggestions: MariEmailPartnerSuggestion[];
  cardCode: string | null;
  projectNumber: string | null;
  contractVisible: string | null;
  nameQueries: string[];
  prefill: {
    projectNumber: string | null;
    projectLabel: string | null;
    contractId: number | null;
    hint: string | null;
  };
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
  const emailQuoted = sqlQuote(email);
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
  AND (
    LOWER(COALESCE(i."ContactPerson", '')) = ${emailQuoted}
    OR LOWER(COALESCE(i."ContactPerson", '')) LIKE LOWER(${sqlQuote(`${email};%`)})
    OR LOWER(COALESCE(i."ContactPerson", '')) LIKE LOWER(${sqlQuote(`%;${email}`)})
    OR LOWER(COALESCE(i."ContactPerson", '')) LIKE LOWER(${sqlQuote(`%;${email};%`)})
  )
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
function emailChipReason(email: string): string {
  return `Teilnehmer ${email}`;
}

function pushEmailCustomer(
  out: MariEmailPartnerSuggestion[],
  seen: Set<string>,
  input: {
    cardCode: string;
    name: string;
    contactName: string | null;
    source: MariEmailPartnerSuggestion["source"];
    email: string;
    projects: MariProjectHint[];
  }
) {
  const reason = emailChipReason(input.email);
  const first = input.projects[0];
  pushSuggestion(out, seen, {
    cardCode: input.cardCode,
    name: input.name,
    contactName: input.contactName,
    source: input.source,
    projectNumber: first?.projectNumber ?? null,
    projectLabel: first?.projectLabel ?? null,
    contractId: first?.contractId ?? null,
    matchedEmail: input.email,
    reason,
  });
}

/**
 * Geschäftspartner zur Absender-/Teilnehmer-E-Mail (OCRD, OCPR).
 * Kollegen-Domains werden übersprungen. Ticket-Historie nur auf Wunsch
 * (Mail-Import) — nie LIKE auf die ganze ContactPerson für @an-group.one.
 */
export async function lookupMariPartnersByEmail(
  rawEmail: string,
  options?: { includeIssueHistory?: boolean }
): Promise<MariEmailPartnerSuggestion[]> {
  requireMariConfig();
  const email = normalizeMariEmail(rawEmail);
  if (!email || isInternalColleagueEmail(email)) return [];

  const seen = new Set<string>();
  const out: MariEmailPartnerSuggestion[] = [];

  try {
    const fromOcrd = await lookupCardCodesFromOcrd(email);
    for (const c of fromOcrd) {
      let projects: MariProjectHint[] = [];
      try {
        projects = await listProjectsForCardCode(c.cardCode, 1);
      } catch {
        projects = [];
      }
      pushEmailCustomer(out, seen, {
        cardCode: c.cardCode,
        name: c.name,
        contactName: null,
        source: "ocrd",
        email,
        projects,
      });
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
        projects = await listProjectsForCardCode(c.cardCode, 1);
      } catch {
        projects = [];
      }
      pushEmailCustomer(out, seen, {
        cardCode: c.cardCode,
        name: c.name,
        contactName: c.contactName,
        source: "ocpr",
        email,
        projects,
      });
    }
  } catch (err) {
    console.warn(
      "[mari] OCPR email lookup failed:",
      err instanceof MariApiError ? err.message : err
    );
  }

  if (options?.includeIssueHistory) {
    try {
      const fromIssues = await lookupCardCodesFromIssues(email);
      const first = fromIssues[0];
      if (first) {
        pushEmailCustomer(out, seen, {
          cardCode: first.cardCode,
          name: first.name,
          contactName: first.contactName,
          source: "issue",
          email,
          projects: first.projectNumber
            ? [
                {
                  projectNumber: first.projectNumber,
                  projectLabel: first.name,
                  contractId: first.contractId,
                },
              ]
            : [],
        });
      }
    } catch (err) {
      console.warn(
        "[mari] issue email lookup failed:",
        err instanceof MariApiError ? err.message : err
      );
    }
  }

  return out.slice(0, 8);
}

/** Merge partner suggestions for several attendee addresses (chips, no autobook). */
export async function lookupMariPartnersByEmails(
  emails: string[]
): Promise<MariEmailPartnerSuggestion[]> {
  const unique: string[] = [];
  const seenEmail = new Set<string>();
  for (const raw of emails) {
    const email = normalizeMariEmail(raw);
    if (!email || seenEmail.has(email) || isInternalColleagueEmail(email)) {
      continue;
    }
    seenEmail.add(email);
    unique.push(email);
    if (unique.length >= 5) break;
  }
  const seen = new Set<string>();
  const out: MariEmailPartnerSuggestion[] = [];
  for (const email of unique) {
    if (isInternalColleagueEmail(email)) continue;
    const rows = await lookupMariPartnersByEmail(email, {
      includeIssueHistory: false,
    });
    for (const row of rows) pushSuggestion(out, seen, row);
  }
  return out.slice(0, 20);
}

function suggestionsFromCustomerProjects(
  cardCode: string,
  name: string,
  projects: MariProjectHint[],
  source: MariEmailPartnerSuggestion["source"]
): MariEmailPartnerSuggestion[] {
  return projects
    .filter((p) => p.projectNumber)
    .map((p) => ({
      cardCode,
      name,
      contactName: null,
      source,
      projectNumber: p.projectNumber,
      projectLabel: p.projectLabel || name,
      contractId: p.contractId,
    }));
}

/** C-CardCode → Projekte + Vertrag aus Ticket-Historie (wie Teilnehmer-Chips). */
export async function lookupMariPartnersByCardCode(
  raw: string
): Promise<MariEmailPartnerSuggestion[]> {
  requireMariConfig();
  const code = normalizeMariCardCode(raw);
  if (!code || !isMariCustomerCardCode(code)) return [];
  const customer = await getMariCustomerByCardCode(code);
  const cardCode = customer?.cardCode || code;
  const name = customer?.name || code;
  const projects = await listProjectsForCardCode(cardCode);
  return suggestionsFromCustomerProjects(cardCode, name, projects, "title");
}

async function lookupContractIdForProject(
  projectNumber: string
): Promise<number | null> {
  const rows = await trySql<{ ContractID: number | null }>(
    `SELECT TOP 1 i."ContractID" AS "ContractID"
FROM "MARISupportIssue" i
WHERE i."ProjectNumber" = ${sqlQuote(projectNumber)}
  AND i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."ContractID" IS NOT NULL
  AND i."ContractID" > 0
GROUP BY i."ContractID"
ORDER BY COUNT(*) DESC`
  );
  const cid = Number(rows?.[0]?.ContractID);
  return Number.isInteger(cid) && cid > 0 ? cid : null;
}

/** V-Vertragsnummer → Kunde + Projekt (Ticket-Spalten, falls vorhanden). */
export async function lookupMariPartnersByContractVisible(
  raw: string
): Promise<MariEmailPartnerSuggestion[]> {
  requireMariConfig();
  const visible = raw.trim().toUpperCase();
  if (!/^V\d{6,}$/.test(visible)) return [];
  const { sanitizeMariProjectNumber } = await import(
    "@/lib/mari/timekeeping-shared"
  );
  for (const col of ["ContractNumber", "ContractVisible", "Contract"] as const) {
    const rows = await trySql<{
      ProjectNumber: string | null;
      CardCode: string | null;
      Name: string | null;
      ContractID: number | null;
    }>(
      `SELECT TOP 8
  i."ProjectNumber" AS "ProjectNumber",
  i."CardCode" AS "CardCode",
  MAX(i."AddressMatchcode") AS "Name",
  MAX(i."ContractID") AS "ContractID"
FROM "MARISupportIssue" i
WHERE i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."ProjectNumber" IS NOT NULL
  AND i."ProjectNumber" <> ''
  AND UPPER(COALESCE(i."${col}", '')) = ${sqlQuote(visible)}
GROUP BY i."ProjectNumber", i."CardCode"
ORDER BY MAX(i."RequestDate") DESC`
    );
    if (!rows || rows.length === 0) continue;
    const out: MariEmailPartnerSuggestion[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const cardCode = normalizeMariCardCode(r.CardCode);
      const pn = sanitizeMariProjectNumber(r.ProjectNumber, { cardCode });
      if (!cardCode || !pn) continue;
      const cid = Number(r.ContractID);
      pushSuggestion(out, seen, {
        cardCode,
        name: (r.Name || "").trim() || cardCode,
        contactName: null,
        source: "title",
        projectNumber: pn,
        projectLabel: (r.Name || "").trim() || null,
        contractId: Number.isInteger(cid) && cid > 0 ? cid : null,
      });
    }
    if (out.length > 0) return out;
  }
  return [];
}

const EMPTY_TITLE_PREFILL: MariEventTitleSuggestResult["prefill"] = {
  projectNumber: null,
  projectLabel: null,
  contractId: null,
  hint: null,
};

/**
 * Betreff-Tokens → Vorschläge, nie Autobuchen.
 * C → Projekt+Vertrag; P → Kunde+Vertrag; V → Kunde+Projekt; Freitext → nur Kunde.
 * P gewinnt gegen C fürs Projekt.
 */
export async function suggestMariPartnersFromEventTitle(
  title: string
): Promise<MariEventTitleSuggestResult> {
  const {
    parseEventTitleTokens,
    eventTitleNameCandidates,
    isConfidentCustomerNameHit,
  } = await import("@/lib/mari/event-title-tokens");
  const tokens = parseEventTitleTokens(title);
  const out: MariEmailPartnerSuggestion[] = [];
  const seen = new Set<string>();
  const nameQueries: string[] = [];

  if (tokens.projectNumber) {
    const customers = await lookupMariCustomersForProject(tokens.projectNumber);
    const customer = customers[0] || null;
    const contractId = tokens.contractVisible
      ? null
      : await lookupContractIdForProject(tokens.projectNumber);
    if (customer) {
      pushSuggestion(out, seen, {
        cardCode: customer.cardCode,
        name: customer.name,
        contactName: null,
        source: "title",
        projectNumber: tokens.projectNumber,
        projectLabel: customer.name,
        contractId,
        reason: `Betreff «${tokens.projectNumber}»`,
      });
    }
    return {
      suggestions: out.slice(0, 20),
      cardCode: tokens.cardCode,
      projectNumber: tokens.projectNumber,
      contractVisible: tokens.contractVisible,
      nameQueries,
      prefill: {
        projectNumber: tokens.projectNumber,
        projectLabel: customer?.name || tokens.projectNumber,
        contractId,
        hint: customer
          ? `Vorschlag aus Betreff «${tokens.projectNumber}» — Kunde ${customer.name}, Vertrag prüfen.`
          : `Vorschlag aus Betreff «${tokens.projectNumber}» — Vertrag prüfen.`,
      },
    };
  }

  if (tokens.cardCode) {
    const rows = await lookupMariPartnersByCardCode(tokens.cardCode);
    for (const row of rows) {
      pushSuggestion(out, seen, {
        ...row,
        reason: `Betreff «${tokens.cardCode}»`,
      });
    }
    const first = rows.find((r) => r.projectNumber) || null;
    return {
      suggestions: out.slice(0, 20),
      cardCode: tokens.cardCode,
      projectNumber: null,
      contractVisible: tokens.contractVisible,
      nameQueries,
      prefill: first?.projectNumber
        ? {
            projectNumber: first.projectNumber,
            projectLabel: first.projectLabel || first.name,
            contractId: tokens.contractVisible ? null : first.contractId,
            hint: `Vorschlag aus Betreff «${tokens.cardCode}» — Projekt und Vertrag prüfen.`,
          }
        : EMPTY_TITLE_PREFILL,
    };
  }

  if (tokens.contractVisible) {
    const rows = await lookupMariPartnersByContractVisible(tokens.contractVisible);
    for (const row of rows) {
      pushSuggestion(out, seen, {
        ...row,
        reason: `Betreff «${tokens.contractVisible}»`,
      });
    }
    const projects = new Set(
      rows.map((r) => r.projectNumber).filter((p): p is string => Boolean(p))
    );
    const first = rows[0] || null;
    const unique = projects.size === 1 && first?.projectNumber;
    return {
      suggestions: out.slice(0, 20),
      cardCode: null,
      projectNumber: null,
      contractVisible: tokens.contractVisible,
      nameQueries,
      prefill: unique
        ? {
            projectNumber: first.projectNumber,
            projectLabel: first.projectLabel || first.name,
            contractId: first.contractId,
            hint: `Vorschlag aus Betreff «${tokens.contractVisible}» — Kunde und Projekt prüfen.`,
          }
        : EMPTY_TITLE_PREFILL,
    };
  }

  for (const q of eventTitleNameCandidates(title)) {
    nameQueries.push(q);
    let customers: MariCustomerOption[] = [];
    try {
      customers = await searchMariCustomers(q, { limit: 12, prefixOnly: true });
    } catch {
      continue;
    }
    const confident = customers.filter(
      (c) =>
        isMariCustomerCardCode(c.cardCode) &&
        isConfidentCustomerNameHit(q, c.name, c.cardCode)
    );
    for (const c of confident.slice(0, 4)) {
      pushSuggestion(out, seen, {
        cardCode: c.cardCode,
        name: c.name,
        contactName: null,
        source: "title",
        projectNumber: null,
        projectLabel: null,
        contractId: null,
        reason: `Betreff «${q}»`,
      });
    }
  }

  return {
    suggestions: out.slice(0, 20),
    cardCode: null,
    projectNumber: null,
    contractVisible: null,
    nameQueries,
    prefill: EMPTY_TITLE_PREFILL,
  };
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
