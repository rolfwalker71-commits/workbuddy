import {
  MariApiError,
  mariPostIssue,
  requireMariConfig,
} from "@/lib/mari/client";
import { normalizeMariCardCode } from "@/lib/mari/customers";
import {
  formatMariImportFailure,
  logMariIssueWrite,
  mariImportFeedbackCode,
  mariIssueIdFromResult,
  shouldRetryMariCreateWithoutMedium,
} from "@/lib/mari/import-result";
import { listMariMedia } from "@/lib/mari/ticket-meta";
import { NEW_STATUS_ID } from "@/lib/mari/status";
import {
  getTicketDetail,
  normalizeMariEmployeeNumber,
  SUPPORT_HOTLINE_CLASS_TYPE,
  type MariTicketDetail,
} from "@/lib/mari/tickets";
import {
  sanitizeMariProjectNumber,
} from "@/lib/mari/timekeeping-shared";
import { parseMariCompanyId } from "@/lib/mari/companies-shared";
import { looksLikeMariHtml } from "@/lib/mari/internal-note";
import { sanitizeMailHtml } from "@/lib/mail/mail-html-display";
import { looksLikeHtmlBody } from "@/lib/mail/strip-signature-images";

/** Wie in patchTicketFields — Fallback wenn ProductID fehlt. */
export const DEFAULT_SUPPORT_PRODUCT_ID = 100001;

/**
 * SAP-Firmen-ID (B1-Schema / MPSysConnections), nicht der Kunde.
 * clsImportSupportIssue.Company — Swagger: «Standard=1», Pflichtfeld beim POST.
 */
export const DEFAULT_SUPPORT_COMPANY_ID = 1;

export type MariIssueCreateInput = {
  briefDescription: string;
  requestText: string;
  contactPerson?: string | null;
  cardCode?: string | null;
  projectNumber: string;
  /** True when Outlook/Graph delivered HTML — RequestText stays HTML. */
  requestIsHtml?: boolean;
  /** SAP-Mandant (MPSysConnections / B1-Schema). Pflicht — aus Projekt, änderbar. */
  company: number;
  contractId?: number | null;
  contractPositionId?: number | null;
  handledBy?: string | null;
  supportGroupId?: number | null;
  priority?: number | null;
  medium?: number | null;
};

export type MariIssueCreateBodyContext = {
  employeeNumber: string;
  phaseId?: number | null;
  mediumId?: number | null;
  issueType?: number | null;
};

function joinContactPerson(name: string, email: string): string | null {
  const n = name.trim();
  const e = email.trim();
  if (n && e) return `${n}; ${e}`;
  if (n) return n;
  if (e) return e;
  return null;
}

export function joinMariContactPerson(
  name: string | null | undefined,
  email: string | null | undefined
): string | null {
  return joinContactPerson(name || "", email || "");
}

const MARI_HTML_MAX = 80_000;
const MARI_TEXT_MAX = 16_000;

function toMariRequestHtml(plain: string, isHtml?: boolean): string {
  const trimmed = plain.trim();
  if (
    isHtml ||
    looksLikeMariHtml(trimmed) ||
    looksLikeHtmlBody(trimmed)
  ) {
    return sanitizeMailHtml(trimmed).slice(0, MARI_HTML_MAX);
  }
  const escaped = trimmed
    .slice(0, MARI_TEXT_MAX)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br />");
}

/**
 * REST-Felder analog GET/POST clsImportSupportIssue
 * (Company, Project, BusinessPartnerCode, ContractPosition, BriefDescription, …).
 */
export function buildMariIssueCreateBody(
  input: MariIssueCreateInput,
  ctx: MariIssueCreateBodyContext
): Record<string, unknown> {
  const pn = sanitizeMariProjectNumber(input.projectNumber);
  if (!pn) {
    throw new MariApiError("Projektnummer ungültig.", 400);
  }
  const company = parseMariCompanyId(input.company);
  if (company == null) {
    throw new MariApiError(
      "Mandant/Company fehlt — bitte aus dem Projekt übernehmen oder setzen.",
      400
    );
  }
  const subject = input.briefDescription.trim().slice(0, 250);
  if (!subject) {
    throw new MariApiError("Betreff fehlt.", 400);
  }
  const emp =
    normalizeMariEmployeeNumber(input.handledBy) ||
    normalizeMariEmployeeNumber(ctx.employeeNumber);
  const cardCode = normalizeMariCardCode(input.cardCode);
  const requestPlain = input.requestText.trim();
  const contact = (input.contactPerson || "").trim();

  const body: Record<string, unknown> = {
    BriefDescription: subject,
    RequestText: requestPlain
      ? toMariRequestHtml(requestPlain, input.requestIsHtml)
      : subject,
    ContactPerson: contact || null,
    Company: company,
    Project: pn,
    Status: NEW_STATUS_ID,
    ProductID: DEFAULT_SUPPORT_PRODUCT_ID,
    ParentType: 0,
    EditorType: 3,
    HotlineClassType: SUPPORT_HOTLINE_CLASS_TYPE,
    ResponsibleType: 3,
  };

  if (cardCode) {
    body.BusinessPartnerCode = cardCode;
  }
  if (emp) {
    body.Responsible = emp;
  }
  if (input.priority != null && input.priority > 0) {
    body.Priority = input.priority;
  }
  const medium =
    input.medium != null && input.medium > 0
      ? input.medium
      : ctx.mediumId != null && ctx.mediumId > 0
        ? ctx.mediumId
        : null;
  if (medium != null) {
    body.Medium = medium;
  }
  if (input.supportGroupId != null && input.supportGroupId > 0) {
    body.SupportGroupID = input.supportGroupId;
  }
  if (ctx.phaseId != null && ctx.phaseId > 0) {
    body.PhaseID = ctx.phaseId;
  }
  if (input.contractId != null && input.contractId > 0) {
    body.ContractID = input.contractId;
  }
  if (input.contractPositionId != null && input.contractPositionId > 0) {
    body.ContractPosition = input.contractPositionId;
  }
  if (ctx.issueType != null && ctx.issueType > 0) {
    body.IssueType = ctx.issueType;
  }

  return body;
}

async function resolvePhaseId(projectNumber: string): Promise<number | null> {
  try {
    const { listPhasesForTimeBooking } = await import(
      "@/lib/mari/timekeeping"
    );
    const phases = await listPhasesForTimeBooking(projectNumber);
    const preferred =
      phases.find((p) =>
        /meeting|besprechung|abstimmung|support/i.test(p.matchcode)
      ) || phases[0];
    const phaseId = preferred ? Number(preferred.keyInternal) || 0 : 0;
    return phaseId > 0 ? phaseId : null;
  } catch {
    return null;
  }
}

async function resolveEmailMediumId(): Promise<number | null> {
  try {
    const media = await listMariMedia();
    const hit = media.find((m) => /e-?mail|e-post|mail/i.test(m.label));
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

function stubTicketFromCreate(
  issueId: number,
  input: MariIssueCreateInput
): MariTicketDetail {
  return {
    issueId,
    briefDescription: input.briefDescription.trim().slice(0, 250),
    status: NEW_STATUS_ID,
    statusName: "NEU",
    priority: 0,
    priorityName: "",
    cardCode: input.cardCode?.trim() || null,
    dueDate: null,
    handledBy: input.handledBy?.trim() || null,
    changeAtDate: null,
    issueType: null,
    issueTypeName: null,
    productId: DEFAULT_SUPPORT_PRODUCT_ID,
    productName: null,
    addressMatchcode: null,
    referenceText: null,
    handledByName: null,
    supportGroupId: input.supportGroupId ?? null,
    supportGroupName: null,
    requestDate: null,
    contactPerson: input.contactPerson?.trim() || null,
    medium: input.medium ?? null,
    mediumName: null,
    stdFreigabe: null,
    aiLabel: null,
    company: parseMariCompanyId(input.company),
    projectNumber: sanitizeMariProjectNumber(input.projectNumber),
    phaseId: null,
    phaseName: null,
    contractId: input.contractId ?? null,
    contractNumber: null,
    contractPositionId: input.contractPositionId ?? null,
    requestText: input.requestText,
    requestTextPlain: "",
    responsible: null,
    responsibleType: 3,
    parentType: 0,
    timeline: [],
  };
}

/**
 * Neues Support-Ticket via POST /api/SupportIssue.
 * IssueID in der Antwort = Erfolg, auch bei IMPORT_Feedback ≠ 0 (Warnung).
 */
export async function createMariIssue(
  input: MariIssueCreateInput
): Promise<{ ticket: MariTicketDetail; payload: Record<string, unknown> }> {
  const cfg = requireMariConfig();
  const pn = sanitizeMariProjectNumber(input.projectNumber);
  if (!pn) {
    throw new MariApiError(
      "Projektnummer fehlt — bitte ein Projekt aus der Liste wählen.",
      400
    );
  }
  if (parseMariCompanyId(input.company) == null) {
    throw new MariApiError(
      "Mandant/Company fehlt — bitte aus dem Projekt übernehmen oder setzen.",
      400
    );
  }

  const [phaseId, mediumId] = await Promise.all([
    resolvePhaseId(pn),
    input.medium != null ? Promise.resolve(null) : resolveEmailMediumId(),
  ]);

  const body = buildMariIssueCreateBody(input, {
    employeeNumber: cfg.employeeNumber,
    phaseId,
    mediumId,
  });

  let result = await mariPostIssue(body);
  logMariIssueWrite("POST", result, body);

  let issueId = mariIssueIdFromResult(result);
  if (shouldRetryMariCreateWithoutMedium(result, "Medium" in body)) {
    const { Medium: _drop, ...withoutMedium } = body;
    const retry = await mariPostIssue(withoutMedium);
    logMariIssueWrite("POST", retry, withoutMedium);
    const retryId = mariIssueIdFromResult(retry);
    if (retryId) {
      result = retry;
      issueId = retryId;
    } else {
      throw new MariApiError(
        formatMariImportFailure(
          retry,
          formatMariImportFailure(result, "MARI POST fehlgeschlagen")
        ),
        400,
        retry
      );
    }
  }

  if (!issueId) {
    throw new MariApiError(
      formatMariImportFailure(
        result,
        "MARI hat keine Ticket-ID zurückgegeben."
      ),
      502,
      result
    );
  }

  const feedback = mariImportFeedbackCode(result);
  if (feedback !== 0) {
    console.warn(
      "[mari] POST created issue with non-zero IMPORT_Feedback",
      issueId,
      feedback,
      result.IMPORT_ErrorMessage || ""
    );
  }

  let ticket: MariTicketDetail;
  try {
    ticket = await getTicketDetail(issueId);
  } catch (err) {
    console.warn("[mari] GET after create failed", issueId, err);
    ticket = stubTicketFromCreate(issueId, input);
  }
  return { ticket, payload: body };
}
