/** Graph HTML / VTT helpers — no full bodies in logs. */

export function stripGraphHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function previewText(text: string, max = 80): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1).trimEnd()}…`;
}

/** WebVTT (Teams transcript) → readable lines. */
export function parseWebVttTranscript(vtt: string): string {
  const lines: string[] = [];
  let speaker = "";
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || line.startsWith("NOTE")) continue;
    if (/^\d+$/.test(line)) continue;
    if (/-->/.test(line)) continue;
    const tagged = /^<v(?:\s+([^>]+))?>/i.exec(line);
    if (tagged) {
      speaker = (tagged[1] || "").trim();
      const rest = stripGraphHtml(line.replace(/^<v[^>]*>/i, "").replace(/<\/v>/gi, ""));
      if (rest) lines.push(speaker ? `${speaker}: ${rest}` : rest);
      continue;
    }
    const text = stripGraphHtml(line);
    if (text) lines.push(speaker ? `${speaker}: ${text}` : text);
  }
  return lines.join("\n").trim();
}

export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
