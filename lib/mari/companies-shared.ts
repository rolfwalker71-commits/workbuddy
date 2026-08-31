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

/** Union by id. Named rows win over «Mandant N» placeholders. */
export function mergeMariCompanyOptions(
  lists: readonly (readonly MariCompanyOption[])[]
): MariCompanyOption[] {
  const byId = new Map<number, MariCompanyOption>();
  for (const list of lists) {
    for (const c of list) {
      if (!c || c.id <= 0) continue;
      const name = (c.name || "").trim() || `Mandant ${c.id}`;
      const existing = byId.get(c.id);
      if (!existing || existing.name === `Mandant ${c.id}`) {
        byId.set(c.id, { id: c.id, name });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
