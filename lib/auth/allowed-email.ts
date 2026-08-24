/** Company domains that may sign in via Microsoft 365 (no admin invite). */
export const DEFAULT_LOGIN_EMAIL_DOMAIN = "an-group.one";

export function allowedLoginEmailDomains(): string[] {
  const raw = process.env.WORKBUDDY_LOGIN_EMAIL_DOMAINS?.trim();
  const list = raw
    ? raw
        .split(/[,;\s]+/)
        .map((d) => d.replace(/^@/, "").trim().toLowerCase())
        .filter(Boolean)
    : [DEFAULT_LOGIN_EMAIL_DOMAIN];
  return [...new Set(list)];
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedCompanyEmail(email: string | null | undefined): boolean {
  const normalized = normalizeLoginEmail(email || "");
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);
  return allowedLoginEmailDomains().includes(domain);
}

/** Preferred usernames for a company mailbox (local-part, then full email). */
export function companyUsernameCandidates(email: string): string[] {
  const normalized = normalizeLoginEmail(email);
  const local = normalized.split("@")[0] || "";
  const cleaned = local.replace(/[^a-z0-9._-]/g, "");
  const out: string[] = [];
  if (cleaned) out.push(cleaned);
  if (!out.includes(normalized)) out.push(normalized);
  return out;
}
