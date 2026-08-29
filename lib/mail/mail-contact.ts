/** Absender aus Outlook-Feldern (from / fromName). */

export function parseMailSender(input: {
  from?: string | null;
  fromName?: string | null;
}): { name: string; email: string } {
  const raw = (input.from || "").trim();
  const named = (input.fromName || "").trim();
  const angle = raw.match(/^(.*)<([^>]+)>/);
  if (angle) {
    const email = angle[2].trim();
    const name = (angle[1] || "").replace(/^"|"$/g, "").trim() || named;
    return { name: name === email ? "" : name, email };
  }
  if (raw.includes("@")) {
    return { name: named && named !== raw ? named : "", email: raw };
  }
  return { name: named || raw, email: "" };
}

export function excerptMailBody(
  bodyText: string | null | undefined,
  snippet?: string | null,
  max = 2000
): string {
  const t = (bodyText || snippet || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}
