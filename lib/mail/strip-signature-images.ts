/**
 * Remove typical Outlook signature / tracking images from mail HTML.
 * Keeps signature text. Used by «Ticket aus Mail» (auto + button).
 */

export type StripSignatureImagesResult = {
  html: string;
  removedCount: number;
  removedContentIds: string[];
};

const SIGNATURE_NAME_RE =
  /signatur|signature|logo|footer|stempel|image00[0-3]/i;

function extractAttr(attrs: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const m = attrs.match(re);
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim() || null;
}

function extractImgSrc(attrs: string): string | null {
  return extractAttr(attrs, "src");
}

export function contentIdFromSrc(src: string | null | undefined): string | null {
  const s = (src || "").trim();
  if (!s) return null;
  const m = /^cid:(.+)$/i.exec(s);
  if (!m?.[1]) return null;
  return m[1].replace(/^<|>$/g, "").trim() || null;
}

function attrNumber(attrs: string, name: string): number | null {
  const raw = extractAttr(attrs, name);
  if (!raw) return null;
  const n = Number(String(raw).replace(/px$/i, ""));
  return Number.isFinite(n) ? n : null;
}

function stylePx(attrs: string, prop: string): number | null {
  const style = extractAttr(attrs, "style") || "";
  const m = new RegExp(`${prop}\\s*:\\s*([\\d.]+)px`, "i").exec(style);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function isTrackingOrTinyImage(attrs: string): boolean {
  const w = attrNumber(attrs, "width") ?? stylePx(attrs, "width");
  const h = attrNumber(attrs, "height") ?? stylePx(attrs, "height");
  if (w != null && h != null && (w <= 3 || h <= 3 || w * h <= 16)) {
    return true;
  }
  if ((w != null && w <= 2) || (h != null && h <= 2)) return true;
  return false;
}

export function filenameLooksLikeSignatureImage(
  name: string | null | undefined
): boolean {
  return SIGNATURE_NAME_RE.test(name || "");
}

function srcLooksLikeSignatureImage(src: string | null): boolean {
  if (!src) return false;
  const path = src.split(/[?#]/)[0] || src;
  const file = path.split("/").pop() || path;
  return filenameLooksLikeSignatureImage(file) || filenameLooksLikeSignatureImage(src);
}

function pushCid(out: string[], src: string | null) {
  const cid = contentIdFromSrc(src);
  if (cid && !out.includes(cid)) out.push(cid);
}

function removeImgs(
  html: string,
  shouldDrop: (attrs: string, src: string | null) => boolean,
  removed: string[]
): { html: string; count: number } {
  let count = 0;
  const next = html.replace(/<img\b([^>]*?)\/?>/gi, (full, attrs: string) => {
    const src = extractImgSrc(attrs || "");
    if (shouldDrop(attrs || "", src)) {
      count += 1;
      pushCid(removed, src);
      return "";
    }
    return full;
  });
  return { html: next, count };
}

function findSignatureTailIndex(html: string): number {
  const markers: RegExp[] = [
    /<[^>]*\bid\s*=\s*["']?Signature\b/i,
    /<[^>]*\bclass\s*=\s*["'][^"']*\bOutlookMessageSignature\b/i,
    /<[^>]*\bclass\s*=\s*["'][^"']*\b(?:moz-signature|gmail_signature)\b/i,
    /(?:<br\s*\/?>|\n)\s*--(?:\s|<br|\n|$)/i,
    />\s*--\s*</,
  ];
  let earliest = -1;
  for (const re of markers) {
    const m = re.exec(html);
    if (m && typeof m.index === "number" && m.index > 40) {
      if (earliest < 0 || m.index < earliest) earliest = m.index;
    }
  }
  return earliest;
}

function stripImgsInSignatureContainers(
  html: string,
  removed: string[]
): { html: string; count: number } {
  let count = 0;
  const next = html.replace(
    /<([a-z][a-z0-9]*)\b([^>]*?)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, inner: string) => {
      const hay = `${attrs} ${tag}`;
      if (
        !/\bid\s*=\s*["']?Signature\b/i.test(hay) &&
        !/\bOutlookMessageSignature\b/i.test(hay) &&
        !/\b(?:moz-signature|gmail_signature)\b/i.test(hay)
      ) {
        return full;
      }
      const cleaned = removeImgs(inner, () => true, removed);
      count += cleaned.count;
      return `<${tag}${attrs}>${cleaned.html}</${tag}>`;
    }
  );
  return { html: next, count };
}

function stripTrailingImgsAfterLastText(
  html: string,
  removed: string[]
): { html: string; count: number } {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<img\b[^>]*\/?>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (!text) return { html, count: 0 };
  const needle = text.slice(-Math.min(24, text.length)).toLowerCase();
  const lastTextIdx = html.toLowerCase().lastIndexOf(needle);
  if (lastTextIdx < 0) return { html, count: 0 };
  const head = html.slice(0, lastTextIdx + 1);
  const tail = html.slice(lastTextIdx + 1);
  const cleaned = removeImgs(
    tail,
    (attrs, src) =>
      isTrackingOrTinyImage(attrs) ||
      Boolean(src && /^cid:/i.test(src)) ||
      srcLooksLikeSignatureImage(src),
    removed
  );
  return { html: head + cleaned.html, count: cleaned.count };
}

/**
 * Drop Outlook signature images and 1×1 tracking pixels.
 * Signature wording stays. Idempotent enough to re-apply from the button.
 */
export function stripOutlookSignatureImages(
  html: string
): StripSignatureImagesResult {
  const removedContentIds: string[] = [];
  let out = html;
  let removedCount = 0;

  const containers = stripImgsInSignatureContainers(out, removedContentIds);
  out = containers.html;
  removedCount += containers.count;

  const tailAt = findSignatureTailIndex(out);
  if (tailAt > 0) {
    const head = out.slice(0, tailAt);
    const tail = out.slice(tailAt);
    const cleaned = removeImgs(
      tail,
      (_attrs, src) => Boolean(src && /^cid:/i.test(src)) || true,
      removedContentIds
    );
    // In the signature tail: drop every <img>, keep text.
    out = head + cleaned.html;
    removedCount += cleaned.count;
  }

  const tiny = removeImgs(
    out,
    (attrs, src) =>
      isTrackingOrTinyImage(attrs) ||
      srcLooksLikeSignatureImage(src) ||
      Boolean(src && /^cid:/i.test(src) && srcLooksLikeSignatureImage(src)),
    removedContentIds
  );
  out = tiny.html;
  removedCount += tiny.count;

  const trailing = stripTrailingImgsAfterLastText(out, removedContentIds);
  out = trailing.html;
  removedCount += trailing.count;

  return {
    html: out.replace(/(<br\s*\/?>\s*){3,}/gi, "<br /><br />").trim(),
    removedCount,
    removedContentIds,
  };
}

export function looksLikeHtmlBody(raw: string | null | undefined): boolean {
  const t = (raw || "").trim();
  if (!t) return false;
  return /<(div|p|br|span|table|html|body|img)\b/i.test(t);
}

export const MAIL_TICKET_HTML_MAX = 80_000;
export const MAIL_TICKET_TEXT_MAX = 8_000;

export function initialMailTicketDescription(input: {
  bodyHtml?: string | null;
  bodyText?: string | null;
  snippet?: string | null;
  /** Graph body.contentType — html wins even if markup is unusual. */
  contentType?: "html" | "text" | null;
}): { body: string; isHtml: boolean; strippedImageCount: number } {
  const html = (input.bodyHtml || "").trim();
  const treatAsHtml =
    input.contentType === "html" ||
    (input.contentType !== "text" && Boolean(html) && looksLikeHtmlBody(html));
  if (treatAsHtml && html) {
    const stripped = stripOutlookSignatureImages(html);
    return {
      body: stripped.html.slice(0, MAIL_TICKET_HTML_MAX),
      isHtml: true,
      strippedImageCount: stripped.removedCount,
    };
  }
  const plain = (input.bodyText || input.snippet || "")
    .replace(/\r\n/g, "\n")
    .trim();
  return {
    body:
      plain.length > MAIL_TICKET_TEXT_MAX
        ? `${plain.slice(0, MAIL_TICKET_TEXT_MAX).trimEnd()}…`
        : plain,
    isHtml: false,
    strippedImageCount: 0,
  };
}
