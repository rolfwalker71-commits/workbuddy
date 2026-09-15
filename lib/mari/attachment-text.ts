import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  getMariAttachmentPayload,
  listMariAttachments,
  type MariAttachmentMeta,
} from "@/lib/mari/attachments";

import {
  isMariPdfAttachment,
  isMariReadableDocument,
  tidyExtractedText,
  type MariDocumentText,
} from "@/lib/mari/attachment-text-shared";

export {
  formatDocumentTextsForPrompt,
  isMariPdfAttachment,
  isMariReadableDocument,
  isMariTextAttachment,
  tidyExtractedText,
} from "@/lib/mari/attachment-text-shared";
export type { MariDocumentText } from "@/lib/mari/attachment-text-shared";

/**
 * Wurzelverzeichnis von pdfjs-dist.
 *
 * Bewusst über die package.json aufgelöst und nicht direkt über die
 * `.mjs`-Dateien: pdfjs-dist steht in serverExternalPackages, und ein
 * `require.resolve` auf ein ES-Modul lässt Turbopack beim Build warnen
 * («require() resolves to an EcmaScript module»). Auf JSON trifft das nicht zu.
 */
function pdfjsPackageDir(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("pdfjs-dist/package.json");
  return pkg.slice(0, pkg.length - "package.json".length);
}

/** file:-URL des pdfjs-Workers, wie sie der Fake-Worker-Import braucht. */
function resolvePdfWorkerUrl(): string {
  return pathToFileURL(`${pdfjsPackageDir()}legacy/build/pdf.worker.mjs`).href;
}

/**
 * Ohne diesen Pfad warnt pdfjs bei jedem PDF mit Standard-Fonts in die
 * Server-Logs. Anders als beim Worker muss das ein Dateisystempfad sein —
 * pdfjs liest die .ttf im Node-Build über fs, eine file:-URL scheitert dort.
 * Fehlt das Verzeichnis, lieber ohne fahren als werfen.
 */
function resolveStandardFontDataUrl(): string | undefined {
  try {
    return `${pdfjsPackageDir()}standard_fonts/`;
  } catch {
    return undefined;
  }
}

type PdfExtraction = {
  text: string;
  pageCount: number;
  pagesRead: number;
  truncated: boolean;
};

/**
 * Text aus einem PDF ziehen — ohne Worker, damit es im Next-Node-Runtime läuft.
 * `pdfjs-dist` steht in next.config serverExternalPackages, sonst zerlegt der
 * Bundler die Lazy-Imports von pdfjs.
 */
export async function extractPdfText(
  bytes: Buffer,
  options?: { maxPages?: number; maxChars?: number }
): Promise<PdfExtraction> {
  const maxPages = Math.min(Math.max(options?.maxPages ?? 25, 1), 100);
  const maxChars = Math.max(options?.maxChars ?? 20_000, 500);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Im Server-Prozess gibt es keinen Web-Worker. pdfjs lädt sein Worker-Modul
  // dann selbst per dynamischem Import — braucht aber eine file:-URL, ein
  // roher Windows-Pfad (C:\…) scheitert dort.
  const globalOptions = (
    pdfjs as unknown as { GlobalWorkerOptions?: { workerSrc?: string } }
  ).GlobalWorkerOptions;
  if (globalOptions && !globalOptions.workerSrc) {
    globalOptions.workerSrc = resolvePdfWorkerUrl();
  }

  const data = new Uint8Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: resolveStandardFontDataUrl(),
    // Passwortgeschützte PDFs sollen scheitern, nicht hängen bleiben.
    password: "",
  }).promise;

  const pageCount = doc.numPages;
  const limit = Math.min(pageCount, maxPages);
  const parts: string[] = [];
  let chars = 0;
  let pagesRead = 0;
  let truncated = false;

  try {
    for (let pageNo = 1; pageNo <= limit; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      try {
        const content = await page.getTextContent();
        const pageText = tidyExtractedText(
          content.items
            .map((item) =>
              "str" in item
                ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : ""}`
                : ""
            )
            .join("")
        );
        pagesRead += 1;
        if (!pageText) continue;
        const header = `--- Seite ${pageNo} ---\n`;
        if (chars + header.length + pageText.length > maxChars) {
          const room = maxChars - chars - header.length;
          if (room > 120) {
            parts.push(`${header}${pageText.slice(0, room).trimEnd()}…`);
          }
          truncated = true;
          break;
        }
        parts.push(`${header}${pageText}`);
        chars += header.length + pageText.length;
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await doc.destroy().catch(() => {});
  }

  if (!truncated && limit < pageCount) truncated = true;

  return {
    text: parts.join("\n\n").trim(),
    pageCount,
    pagesRead,
    truncated,
  };
}

/** Klartext-Anhang dekodieren (UTF-8, BOM weg). */
export function decodeTextAttachment(bytes: Buffer, maxChars: number): string {
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const tidy = tidyExtractedText(text);
  return tidy.length > maxChars ? `${tidy.slice(0, maxChars).trimEnd()}…` : tidy;
}

async function readDocument(
  meta: MariAttachmentMeta,
  limits: { maxBytes: number; maxPages: number; maxCharsPerDoc: number }
): Promise<MariDocumentText | null> {
  const payload = await getMariAttachmentPayload(meta.attachmentId, {
    maxBytes: limits.maxBytes,
  });
  if (!payload) return null;

  const base = {
    attachmentId: meta.attachmentId,
    orgFilename: payload.orgFilename || meta.orgFilename,
    mimeType: meta.mimeType,
    byteLength: payload.byteLength,
  };

  if (isMariPdfAttachment(meta.mimeType, base.orgFilename)) {
    const extracted = await extractPdfText(payload.bytes, {
      maxPages: limits.maxPages,
      maxChars: limits.maxCharsPerDoc,
    });
    return {
      ...base,
      text: extracted.text,
      pageCount: extracted.pageCount,
      pagesRead: extracted.pagesRead,
      // Kein Textlayer trotz gelesener Seiten → Scan.
      needsOcr: extracted.text.length === 0 && extracted.pagesRead > 0,
      truncated: extracted.truncated,
    };
  }

  const text = decodeTextAttachment(payload.bytes, limits.maxCharsPerDoc);
  return {
    ...base,
    text,
    pageCount: null,
    pagesRead: null,
    needsOcr: false,
    truncated: text.endsWith("…"),
  };
}

/**
 * Dokument-Anhänge eines Tickets als Text für die AI-Analyse laden.
 * Ohne `attachmentIds` passiert nichts — Dokumente werden nur auf
 * ausdrückliche Auswahl im Picker gelesen (Kosten + Rauschen).
 */
export async function listMariDocumentTextsForAi(
  issueId: number,
  options?: {
    attachmentIds?: number[];
    maxDocuments?: number;
    maxBytesPerDocument?: number;
    maxPagesPerDocument?: number;
    maxCharsPerDocument?: number;
  }
): Promise<MariDocumentText[]> {
  const wanted = (options?.attachmentIds || [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (wanted.length === 0) return [];

  const maxDocuments = Math.min(Math.max(options?.maxDocuments ?? 4, 1), 8);
  const limits = {
    maxBytes: options?.maxBytesPerDocument ?? 20_000_000,
    maxPages: options?.maxPagesPerDocument ?? 25,
    maxCharsPerDoc: options?.maxCharsPerDocument ?? 20_000,
  };

  const order = new Map(wanted.map((id, i) => [id, i] as const));
  const metas = (await listMariAttachments(issueId))
    .filter((a) => a.hasFile && order.has(a.attachmentId))
    .filter((a) => isMariReadableDocument(a.mimeType, a.orgFilename))
    .sort(
      (a, b) =>
        (order.get(a.attachmentId) ?? 0) - (order.get(b.attachmentId) ?? 0)
    )
    .slice(0, maxDocuments);

  const out: MariDocumentText[] = [];
  for (const meta of metas) {
    try {
      const doc = await readDocument(meta, limits);
      if (doc) out.push(doc);
    } catch {
      // Ein kaputtes/verschlüsseltes PDF darf die Analyse nicht killen.
    }
  }
  return out;
}
