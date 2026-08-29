import {
  MariApiError,
  mariPostIssue,
  requireMariConfig,
} from "@/lib/mari/client";
import { normalizeMariCardCode } from "@/lib/mari/customers";
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

/** Wie in patchTicketFields — Fallback wenn ProductID fehlt. */
export const DEFAULT_SUPPORT_PRODUCT_ID = 100001;

export type MariIssueCreateInput = {
  briefDescription: string;
  requestText: string;
  contactPerson?: string | null;
  cardCode?: string | null;
  projectNumber: string;
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

function toMariRequestHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br />");
}

/**
 * REST-Felder analog PATCH / GET SupportIssue
 * (Project, BusinessPartnerCode, ContractPosition, BriefDescription, …).
 */
export function buildMariIssueCreateBody(
  input: MariIssueCreateInput,
  ctx: MariIssueCreateBodyContext
): Record<string, unknown> {
  const pn = sanitizeMariProjectNumber(input.projectNumber);
  if (!pn) {
    throw new MariApiError("Projektnummer ungültig.", 400);
  }
  const subject = input.briefDescription.trim().slice(0, 250);
  if (!subject) {
    throw new MariApiError("Betreff fehlt.", 400);
  }
  const emp =
    normalizeMariEmployeeNumber(input.handledBy) ||
    normalizeMariEmployeeNumber(ctx.employeeNumber);
  const cardCode = normalizeMariCardCode(input.cardCode);
  const requestPlain = input.requestText.trim().slice(0, 8000);
  const contact = (input.contactPerson || "").trim();

  const body: Record<string, unknown> = {
    BriefDescription: subject,
    RequestText: requestPlain ? toMariRequestHtml(requestPlain) : subject,
    ContactPerson: contact || null,
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

function issueIdFromResult(result: Record<string, unknown>): number {
  const raw = result.IssueID ?? result.issueId ?? result.ID;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Neues Support-Ticket via POST /api/SupportIssue.
 * Bei MARI-Fehler (HTTP oder IMPORT_Feedback) wird geworfen — Formular bleibt.
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
  if (result.IMPORT_Feedback && result.IMPORT_Feedback !== 0) {
    if ("Medium" in body) {
      const { Medium: _drop, ...withoutMedium } = body;
      const retry = await mariPostIssue(withoutMedium);
      if (retry.IMPORT_Feedback && retry.IMPORT_Feedback !== 0) {
        throw new MariApiError(
          retry.IMPORT_ErrorMessage ||
            result.IMPORT_ErrorMessage ||
            "MARI POST fehlgeschlagen",
          400,
          retry
        );
      }
      result = retry;
    } else {
      throw new MariApiError(
        result.IMPORT_ErrorMessage || "MARI POST fehlgeschlagen",
        400,
        result
      );
    }
  }

  const issueId = issueIdFromResult(result as Record<string, unknown>);
  if (!issueId) {
    throw new MariApiError(
      result.IMPORT_ErrorMessage ||
        "MARI hat keine Ticket-ID zurückgegeben.",
      502,
      result
    );
  }

  const ticket = await getTicketDetail(issueId);
  return { ticket, payload: body };
}
