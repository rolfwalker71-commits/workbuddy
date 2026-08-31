/** Client-sichere Typen & Pure Helpers für MARI-Zeiterfassung (kein Node/SQLite). */

import {
  formatSwissDate,
  formatSwissDateRange,
  toSwissWeekday,
} from "@/lib/utils/dates";

export const TIMEKEEPING_SOURCE_SUPPORT_ISSUE = 2;

export type MariKeyPair = {
  matchcode: string;
  keyVisible: string;
  keyInternal: string;
  indent: number;
  indentParent: boolean;
  /** SAP-Mandant (B1-Schema), wenn die Projektliste ihn mitliefert. */
  company?: number | null;
};

/** First wins. Same visible key + company is one row; company 0 merges with a known mandant. */
export function mergeMariKeyPairs(
  lists: readonly (readonly MariKeyPair[])[]
): MariKeyPair[] {
  const out: MariKeyPair[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      const vis = (item.keyVisible || item.keyInternal).trim().toLowerCase();
      if (!vis) continue;
      const company = item.company && item.company > 0 ? item.company : 0;
      const companyKey = `${company}:${vis}`;
      if (seen.has(companyKey) || seen.has(`0:${vis}`)) continue;
      seen.add(companyKey);
      if (company > 0) seen.add(`0:${vis}`);
      out.push(item);
    }
  }
  return out;
}

/** MARI ApprovalMode: 0 erfasst, -1 freigegeben, 2 Vorerfassung, 3 abgelehnt. */
export type MariApprovalStatus =
  | "recorded"
  | "approved"
  | "draft"
  | "rejected"
  | "unknown";

export type MariTimePeriod = "day" | "week" | "month" | "quarter";

export type MariTimeLine = {
  lineId: number;
  serviceDate: string;
  employeeNumber: string;
  employeeName: string | null;
  projectNumber: string;
  /** Kunden-/Projektname (Matchcode), wenn bekannt — UI: «Kunde (P…)». */
  projectCustomer: string | null;
  phaseId: number;
  activity: string;
  memo: string | null;
  /** USER_ND_Int_Bemerkung_Verr — Interne Bemerkung zur Verrechnung */
  internalRemarkVerr: string | null;
  /** USER_Begruendung — Grund für Nullerstunden */
  zeroHoursReason: string | null;
  hours: number;
  hoursBillable: number;
  billable: boolean;
  contractId: number;
  /** Sichtbare Vertragsnummer (z.B. V60011100), wenn MARI sie liefert. */
  contractNumber: string | null;
  /** Vertragsbezeichnung (Matchcode), wenn bekannt. */
  contractName: string | null;
  contractPositionId: number;
  /** Sichtbare Positionsnummer, wenn MARI sie liefert. */
  contractPositionNumber: string | null;
  /** Positionsbezeichnung (Matchcode), wenn bekannt. */
  contractPositionName: string | null;
  sourceType: number;
  sourceReference: number;
  timeStart: string | null;
  timeEnd: string | null;
  createDate: string | null;
  approvalMode: number;
  approvalStatus: MariApprovalStatus;
  /** true wenn ApprovalMode === -1 (freigegeben). */
  approved: boolean;
  /** Optional MARI-Hinweis (z.B. Warnings nach erfolgreichem Import). */
  warning?: string | null;
};

/**
 * First integer greater than 0. Zero must not win over a later REST ContractID
 * (`detail.contractId ?? raw.ContractID` keeps 0 and drops the real id).
 */
export function firstPositiveInt(...vals: unknown[]): number {
  for (const v of vals) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return 0;
}

/** Match a MARI key pair by internal id, visible token, or numeric ContractID. */
export function findMariKeyPair(
  options: MariKeyPair[],
  id: string | number | null | undefined
): MariKeyPair | undefined {
  if (id == null || id === "") return undefined;
  const raw = String(id).trim();
  if (!raw) return undefined;
  const n = Number(raw);
  const up = raw.toUpperCase();
  return options.find((o) => {
    if (o.keyInternal === raw || o.keyVisible === raw) return true;
    if (Number.isInteger(n) && n > 0) {
      return Number(o.keyInternal) === n || Number(o.keyVisible) === n;
    }
    return (
      o.keyVisible.toUpperCase() === up || o.matchcode.toUpperCase() === up
    );
  });
}

export type TimeLineBookPrefillSource = {
  serviceDate?: string | null;
  projectNumber?: string | null;
  projectCustomer?: string | null;
  projectLabel?: string | null;
  activity?: string | null;
  memo?: string | null;
  hours?: number | null;
  hoursBillable?: number | null;
  billable?: boolean | null;
  contractId?: number | null;
  contractPositionId?: number | null;
  contractVisible?: string | null;
  contractNumber?: string | null;
  contractName?: string | null;
  issueId?: number | null;
  internalRemarkVerr?: string | null;
  zeroHoursReason?: string | null;
  customerName?: string | null;
  cardCode?: string | null;
};

export type TimeLineBookPrefill = {
  dayOfService: string;
  projectNumber: string;
  projectLabel: string;
  contractId: number | null;
  contractPositionId: number | null;
  contractVisible: string | null;
  activity: string;
  memoText: string;
  hours: number;
  hoursBillable: number;
  billable: boolean;
  issueId: number | null;
  internalRemarkVerr: string | null;
  zeroHoursReason: string | null;
  customerName: string | null;
  cardCode: string | null;
};

/** Prefill for edit/duplicate: keep Kunde, Projekt and Vertrag from the saved line. */
export function timeLineToBookPrefill(
  full: TimeLineBookPrefillSource,
  line?: TimeLineBookPrefillSource | null
): TimeLineBookPrefill {
  const projectNumber = (full.projectNumber || line?.projectNumber || "").trim();
  const customerName =
    (
      full.customerName ||
      full.projectCustomer ||
      line?.customerName ||
      line?.projectCustomer ||
      ""
    ).trim() || null;
  const contractId = firstPositiveInt(full.contractId, line?.contractId);
  const contractPositionId = firstPositiveInt(
    full.contractPositionId,
    line?.contractPositionId
  );
  const hours = full.hours ?? line?.hours ?? 0;
  const hoursBillable = full.hoursBillable ?? line?.hoursBillable ?? 0;
  const issueId = firstPositiveInt(full.issueId, line?.issueId);
  return {
    dayOfService: (full.serviceDate || line?.serviceDate || "").slice(0, 10),
    projectNumber,
    projectLabel:
      (full.projectLabel || "").trim() ||
      formatMariProjectLabel(projectNumber, customerName),
    contractId: contractId > 0 ? contractId : null,
    contractPositionId: contractPositionId > 0 ? contractPositionId : null,
    contractVisible:
      (
        full.contractVisible ||
        full.contractNumber ||
        line?.contractVisible ||
        line?.contractNumber ||
        ""
      ).trim() || null,
    activity: (full.activity || line?.activity || "").trim(),
    memoText: full.memo || line?.memo || "",
    hours,
    hoursBillable,
    billable: full.billable ?? line?.billable ?? hoursBillable > 0,
    issueId: issueId > 0 ? issueId : null,
    internalRemarkVerr:
      full.internalRemarkVerr ?? line?.internalRemarkVerr ?? null,
    zeroHoursReason: full.zeroHoursReason ?? line?.zeroHoursReason ?? null,
    customerName,
    cardCode: (full.cardCode || line?.cardCode || "").trim() || null,
  };
}

function firstVisibleMariText(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null || v === "") continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

export type MariContractFields = {
  contractId: number;
  contractNumber: string | null;
  contractName: string | null;
  contractPositionId: number;
  contractPositionNumber: string | null;
  contractPositionName: string | null;
};

const EMPTY_CONTRACT_FIELDS: MariContractFields = {
  contractId: 0,
  contractNumber: null,
  contractName: null,
  contractPositionId: 0,
  contractPositionNumber: null,
  contractPositionName: null,
};

/** Vertrags- und Positionsfelder aus einer MARI-Zeile (SQL oder REST) — keine erfundenen Labels. */
export function contractFieldsFromMariRow(r: Record<string, unknown>): MariContractFields {
  const contractId = firstPositiveInt(
    r.ContractID,
    r.ContractId,
    r.AbsID
  );
  const contractPositionId = firstPositiveInt(
    r.ContractPositionID,
    r.ContractPositionId,
    r.ContractPosition,
    r.PositionID,
    r.PosID
  );
  return {
    contractId,
    contractNumber: firstVisibleMariText(
      r.ContractNumber,
      r.ContractVisible,
      r.Contract
    ),
    contractName: firstVisibleMariText(r.ContractName, r.ContractMatchcode),
    contractPositionId,
    contractPositionNumber: firstVisibleMariText(
      r.ContractPositionNumber,
      r.ContractPositionVisible,
      r.PositionNumber,
      typeof r.Position === "string" ? r.Position : null
    ),
    contractPositionName: firstVisibleMariText(
      r.ContractPositionName,
      r.ContractPositionMatchcode,
      r.PositionName,
      r.PositionMatchcode
    ),
  };
}

/**
 * SQL liefert oft ContractID 0 (Spalte fehlt oder View ohne Wert).
 * Erste positive ID aus SQL oder REST gewinnt — 0 darf REST nicht verdecken.
 */
export function applyMariContractFields(
  current: Partial<MariContractFields> | null | undefined,
  ...rows: Array<Record<string, unknown> | null | undefined>
): MariContractFields {
  const extras = rows
    .filter((r): r is Record<string, unknown> => r != null)
    .map(contractFieldsFromMariRow);
  const parts = [current || EMPTY_CONTRACT_FIELDS, ...extras];
  return {
    contractId: firstPositiveInt(...parts.map((p) => p.contractId)),
    contractNumber:
      firstVisibleMariText(...parts.map((p) => p.contractNumber)) || null,
    contractName:
      firstVisibleMariText(...parts.map((p) => p.contractName)) || null,
    contractPositionId: firstPositiveInt(
      ...parts.map((p) => p.contractPositionId)
    ),
    contractPositionNumber:
      firstVisibleMariText(...parts.map((p) => p.contractPositionNumber)) ||
      null,
    contractPositionName:
      firstVisibleMariText(...parts.map((p) => p.contractPositionName)) || null,
  };
}

/** Anzeige «Nummer · Bezeichnung» — wie der Vertrag-Picker, ohne Doppelung. */
export function formatMariContractLabel(
  contractNumber?: string | null,
  contractName?: string | null
): string | null {
  const num = (contractNumber || "").trim();
  const name = (contractName || "").trim();
  if (num && name && name !== num) return `${num} · ${name}`;
  if (num) return num;
  if (name) return name;
  return null;
}

export type MariContractListLineInput = {
  contractId?: number | null;
  contractNumber?: string | null;
  contractName?: string | null;
  contractPositionId?: number | null;
  contractPositionNumber?: string | null;
  contractPositionName?: string | null;
};

/**
 * Zweite/dritte Zeile unter dem Kunden: Vertrag und Vertragsposition.
 * «Kein Vertrag» nur wenn wirklich kein Vertrag (intern / keine ID, keine Nummer).
 * ID bekannt, Bezeichnung noch nicht aufgelöst — Zeile weglassen, nichts erfinden.
 */
export function formatMariContractListLines(
  input: MariContractListLineInput
): string[] {
  const contract = formatMariContractLabel(
    input.contractNumber,
    input.contractName
  );
  const position = formatMariContractLabel(
    input.contractPositionNumber,
    input.contractPositionName
  );
  if (contract && position) return [contract, position];
  if (contract) return [contract];
  if (firstPositiveInt(input.contractId) > 0) {
    return position ? [position] : [];
  }
  return ["Kein Vertrag"];
}

export function formatMariContractListLine(
  input: MariContractListLineInput
): string | null {
  const lines = formatMariContractListLines(input);
  if (lines.length === 0) return null;
  return lines.join(" · ");
}

/** Anzeige «Kunde (Projektnummer)» — ohne Doppelung, wenn Name die Nummer schon enthält. */
export function formatMariProjectLabel(
  projectNumber: string | null | undefined,
  customerOrName?: string | null
): string {
  const pn = (projectNumber || "").trim();
  const name = (customerOrName || "").trim();
  if (!pn && !name) return "–";
  if (!name) return pn;
  if (!pn) return name;
  if (
    name === pn ||
    name.includes(`(${pn})`) ||
    name.endsWith(` ${pn}`) ||
    name.startsWith(`${pn} `)
  ) {
    return name;
  }
  return `${name} (${pn})`;
}

/**
 * True for MARI project numbers (e.g. P600014). Rejects customer names / CardCodes
 * so Kopf-Formulare nicht mit Matchcode vorbelegt werden.
 */
export function looksLikeMariProjectNumber(
  raw: string | null | undefined
): boolean {
  const t = (raw || "").trim();
  if (!t || /\s/.test(t)) return false;
  if (/^P\d{3,}$/i.test(t)) return true;
  // manche Mandanten nutzen rein numerische Projektkeys
  if (/^\d{4,}$/.test(t)) return true;
  return false;
}

export function sanitizeMariProjectNumber(
  projectNumber: string | null | undefined,
  opts?: { addressMatchcode?: string | null; cardCode?: string | null }
): string | null {
  const pn = (projectNumber || "").trim();
  if (!pn) return null;
  const am = (opts?.addressMatchcode || "").trim();
  const cc = (opts?.cardCode || "").trim();
  if (am && pn === am) return null;
  if (cc && pn === cc) return null;
  if (!looksLikeMariProjectNumber(pn)) return null;
  return pn;
}

/** MARI-Sentinel «01.01.0001» / leere DueDate → null. */
export function normalizeMariDueDate(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  const d = raw.trim();
  const ymd = d.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  if (!Number.isFinite(y) || y < 1900) return null;
  return d;
}

export type MariDayTimeSummary = {
  date: string;
  period: MariTimePeriod;
  fromDate: string;
  toDate: string;
  lines: MariTimeLine[];
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  /**
   * Maringo Tag-grid Überstunden as of `date` (running saldo).
   * Null when calendar/period data is missing.
   */
  overtimeHours: number | null;
};

export function mapApprovalMode(raw: unknown): {
  approvalMode: number;
  approvalStatus: MariApprovalStatus;
  approved: boolean;
} {
  const approvalMode = Number(raw);
  const mode = Number.isFinite(approvalMode) ? approvalMode : NaN;
  let approvalStatus: MariApprovalStatus = "unknown";
  if (mode === -1) approvalStatus = "approved";
  else if (mode === 0) approvalStatus = "recorded";
  else if (mode === 2) approvalStatus = "draft";
  else if (mode === 3) approvalStatus = "rejected";
  return {
    approvalMode: Number.isFinite(mode) ? mode : 0,
    approvalStatus,
    approved: mode === -1,
  };
}

export function approvalStatusLabel(status: MariApprovalStatus): string {
  switch (status) {
    case "approved":
      return "Freigegeben";
    case "recorded":
      return "Erfasst";
    case "draft":
      return "Vorerfassung";
    case "rejected":
      return "Abgelehnt";
    default:
      return "Unbekannt";
  }
}

function parseYmdParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function assertYmd(ymd: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error("Datum ungültig (YYYY-MM-DD).");
  }
}

/** Kalendertag + n Tage (UTC-Datumsteile, ohne TZ-Drift). */
export function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmdParts(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Zeitraum um Ankerdatum: Tag, ISO-Woche (Mo–So), Monat, Kalenderquartal.
 */
export function resolveTimePeriodRange(
  anchorYmd: string,
  period: MariTimePeriod
): { fromDate: string; toDate: string; toExclusive: string } {
  assertYmd(anchorYmd);
  const { y, m, d } = parseYmdParts(anchorYmd);

  if (period === "day") {
    return {
      fromDate: anchorYmd,
      toDate: anchorYmd,
      toExclusive: addDaysYmd(anchorYmd, 1),
    };
  }

  if (period === "week") {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=So
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const fromDate = addDaysYmd(anchorYmd, mondayOffset);
    const toDate = addDaysYmd(fromDate, 6);
    return { fromDate, toDate, toExclusive: addDaysYmd(toDate, 1) };
  }

  if (period === "month") {
    const fromDate = formatYmd(y, m, 1);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const toDate = formatYmd(y, m, lastDay);
    return { fromDate, toDate, toExclusive: addDaysYmd(toDate, 1) };
  }

  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const fromDate = formatYmd(y, qStartMonth, 1);
  const qEndMonth = qStartMonth + 2;
  const lastDay = new Date(Date.UTC(y, qEndMonth, 0)).getUTCDate();
  const toDate = formatYmd(y, qEndMonth, lastDay);
  return { fromDate, toDate, toExclusive: addDaysYmd(toDate, 1) };
}

export function formatPeriodLabel(
  period: MariTimePeriod,
  fromDate: string,
  toDate: string
): string {
  if (period === "day") {
    const weekday = toSwissWeekday(fromDate);
    const date = formatSwissDate(fromDate);
    return weekday ? `${weekday}, ${date}` : date;
  }
  return formatSwissDateRange(fromDate, toDate);
}

/** Ankerdatum um einen Zeitraum verschieben (Tag/Woche/Monat/Quartal). */
export function shiftTimePeriodAnchor(
  anchorYmd: string,
  period: MariTimePeriod,
  steps: number
): string {
  assertYmd(anchorYmd);
  if (period === "day") return addDaysYmd(anchorYmd, steps);
  if (period === "week") return addDaysYmd(anchorYmd, steps * 7);

  const range = resolveTimePeriodRange(anchorYmd, period);
  const { y, m } = parseYmdParts(range.fromDate);
  const monthDelta = period === "month" ? steps : steps * 3;
  const dt = new Date(Date.UTC(y, m - 1 + monthDelta, 1));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
}

/** Distinct project numbers that still need a customer/matchcode label. */
export function projectNumbersNeedingLabel(
  lines: readonly { projectNumber: string; projectCustomer?: string | null }[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if ((line.projectCustomer || "").trim()) continue;
    const pn = line.projectNumber.trim();
    if (!pn || seen.has(pn)) continue;
    seen.add(pn);
    out.push(pn);
  }
  return out;
}
