import { normalizeMailSenderEmail } from "@/lib/mail/mail-threads";

export type MailSenderBlacklistEntry = {
  email: string;
  name: string | null;
};

export const MAIL_SENDER_BLACKLIST_MAX = 80;

export const SYSTEM_MAIL_HIDE_NOTE =
  "Mails mit Betreff «[SYSTEM INFOBOARD]» oder «[Monitoring]» (z. B. System Infoboard / monitoringalerts) sind automatisch ausgeblendet — nicht in der Liste löschbar.";

export function parseMailSenderBlacklist(
  raw: unknown
): MailSenderBlacklistEntry[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: MailSenderBlacklistEntry[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (out.length >= MAIL_SENDER_BLACKLIST_MAX) break;
    let email: string | null = null;
    let name: string | null = null;
    if (typeof item === "string") {
      email = normalizeMailSenderEmail(item);
    } else if (item && typeof item === "object") {
      const rec = item as { email?: unknown; name?: unknown };
      email = normalizeMailSenderEmail(
        typeof rec.email === "string" ? rec.email : null
      );
      if (typeof rec.name === "string") {
        const n = rec.name.trim();
        name = n ? n.slice(0, 160) : null;
      }
    }
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name });
  }
  return out;
}

export function serializeMailSenderBlacklist(
  entries: MailSenderBlacklistEntry[]
): string {
  return JSON.stringify(parseMailSenderBlacklist(entries));
}

export function mailSenderBlacklistEmails(
  entries: MailSenderBlacklistEntry[]
): string[] {
  return entries.map((e) => e.email);
}

export function upsertMailSenderBlacklistEntry(
  entries: MailSenderBlacklistEntry[],
  input: { email: string; name?: string | null }
): MailSenderBlacklistEntry[] {
  const email = normalizeMailSenderEmail(input.email);
  if (!email) throw new Error("Keine gültige Absender-Adresse.");
  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 160)
      : null;
  const next = entries.filter((e) => e.email !== email);
  next.unshift({ email, name: name || entries.find((e) => e.email === email)?.name || null });
  if (next.length > MAIL_SENDER_BLACKLIST_MAX) {
    throw new Error(
      `Maximal ${MAIL_SENDER_BLACKLIST_MAX} ausgeblendete Absender.`
    );
  }
  return next;
}

export function removeMailSenderBlacklistEntry(
  entries: MailSenderBlacklistEntry[],
  email: string
): MailSenderBlacklistEntry[] {
  const want = normalizeMailSenderEmail(email);
  if (!want) return entries;
  return entries.filter((e) => e.email !== want);
}
