/**
 * Text für die gesammelte Mail-Meldung. Rein, damit Zählung und Formulierung
 * ohne Graph testbar sind.
 */
export type MailDigestSender = {
  fromName: string;
  from: string;
};

export function buildMailDigestText(
  items: readonly MailDigestSender[]
): { headline: string; detail: string } {
  const count = items.length;
  const headline = count === 1 ? "1 neue Mail" : `${count} neue Mails`;

  // Nach Adresse entdoppeln, aber den lesbaren Namen zeigen.
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of items) {
    const key = (item.from || item.fromName || "").toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const name = (item.fromName || item.from || "").trim();
    if (name) names.push(name);
  }

  if (names.length === 0) return { headline, detail: "" };

  const top = names.slice(0, 3);
  const rest = names.length - top.length;
  const list = rest > 0 ? `${top.join(", ")}, +${rest}` : top.join(", ");
  const senderCount =
    names.length === 1 ? "1 Absender" : `${names.length} Absender`;
  return { headline, detail: `${senderCount} · ${list}` };
}
