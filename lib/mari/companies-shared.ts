/** Client-sichere Company/Mandant-Typen und Parser (kein Node/SQL). */

export type MariCompanyOption = {
  id: number;
  name: string;
};

export function parseMariCompanyId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 9999) return null;
  return n;
}

export function formatMariCompanyLabel(
  id: number,
  name?: string | null
): string {
  const n = (name || "").trim();
  if (n && n !== String(id) && !n.endsWith(`(${id})`)) {
    return `${n} (${id})`;
  }
  return n || `Mandant ${id}`;
}

export function companyFromMariIssue(
  issue: Record<string, unknown> | null | undefined
): number | null {
  if (!issue) return null;
  return parseMariCompanyId(issue.Company ?? issue.company);
}
