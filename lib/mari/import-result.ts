/** Parse MARI POST/PATCH import results without treating warnings as failure. */

export function mariIssueIdFromResult(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const rec = result as Record<string, unknown>;
  const raw = rec.IssueID ?? rec.issueId ?? rec.ID;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function mariImportFeedbackCode(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const n = Number((result as { IMPORT_Feedback?: unknown }).IMPORT_Feedback);
  return Number.isFinite(n) ? n : 0;
}

function firstUsefulText(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Human-readable MARI import error. Never collapse to a bare fallback
 * if Feedback, HTTP status, or a body snippet is available.
 */
export function formatMariImportFailure(
  result: unknown,
  fallback: string,
  httpStatus?: number
): string {
  const rec =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null;
  const feedback = rec ? mariImportFeedbackCode(rec) : 0;
  const msg = firstUsefulText(
    rec?.IMPORT_ErrorMessage,
    rec?.Message,
    rec?.EXPORT_INFO,
    rec?.ExceptionMessage
  );
  const parts: string[] = [msg || fallback];
  const meta: string[] = [];
  if (httpStatus != null && httpStatus > 0) meta.push(`HTTP ${httpStatus}`);
  if (feedback !== 0) meta.push(`IMPORT_Feedback ${feedback}`);
  const issueId = rec ? mariIssueIdFromResult(rec) : 0;
  if (issueId) meta.push(`IssueID ${issueId}`);
  if (meta.length > 0) parts.push(`(${meta.join(", ")})`);
  if (!msg && rec) {
    try {
      const snippet = JSON.stringify({
        IMPORT_Feedback: rec.IMPORT_Feedback ?? null,
        IMPORT_ErrorMessage: rec.IMPORT_ErrorMessage ?? null,
        EXPORT_INFO: rec.EXPORT_INFO ?? null,
        Message: rec.Message ?? null,
        IssueID: rec.IssueID ?? rec.issueId ?? rec.ID ?? null,
      });
      if (snippet && snippet !== "{}") parts.push(snippet);
    } catch {
      /* ignore */
    }
  }
  return parts.join(" ").trim();
}

/** Second POST only when the first response clearly created no ticket. */
export function shouldRetryMariCreateWithoutMedium(
  result: unknown,
  bodyHasMedium: boolean
): boolean {
  return bodyHasMedium && mariIssueIdFromResult(result) <= 0;
}

export function logMariIssueWrite(
  method: "POST" | "PATCH",
  result: unknown,
  payload: Record<string, unknown>
): void {
  const rec =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null;
  console.info(`[mari] ${method} /api/SupportIssue`, {
    Company: payload.Company ?? null,
    Project: payload.Project ?? null,
    Medium: payload.Medium ?? null,
    ContractID: payload.ContractID ?? null,
    IssueID: rec ? mariIssueIdFromResult(rec) : null,
    IMPORT_Feedback: rec?.IMPORT_Feedback ?? null,
    IMPORT_ErrorMessage: rec?.IMPORT_ErrorMessage ?? null,
    EXPORT_INFO: rec?.EXPORT_INFO ?? null,
  });
}
