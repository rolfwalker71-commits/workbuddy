export const MAX_BULK_TICKET_IDS = 50;

export type TicketBulkAction = "delete" | "status" | "dueDate";

export type TicketBulkItemResult = {
  issueId: number;
  ok: boolean;
  error?: string;
};

export function sanitizeBulkIssueIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((value) => Number(value))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, MAX_BULK_TICKET_IDS);
}

export function formatTicketIdList(
  ids: readonly number[],
  max = 12
): string {
  const labels = ids.map((id) => `#${id}`);
  if (labels.length <= max) return labels.join(", ");
  const rest = labels.length - max;
  return `${labels.slice(0, max).join(", ")} und ${rest} weitere`;
}

export function summarizeBulkResults(results: TicketBulkItemResult[]): {
  succeeded: number[];
  failed: { issueId: number; error: string }[];
} {
  const succeeded: number[] = [];
  const failed: { issueId: number; error: string }[] = [];
  for (const row of results) {
    if (row.ok) succeeded.push(row.issueId);
    else {
      failed.push({
        issueId: row.issueId,
        error: row.error || "Unbekannter Fehler",
      });
    }
  }
  return { succeeded, failed };
}
