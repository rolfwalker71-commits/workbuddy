/**
 * Anhang-Textextraktion: die Teile ohne `node:`-Imports und ohne MARI-Client,
 * damit der Analyse-Picker (Client-Component) sie nutzen kann.
 * Server-Seite liegt in `attachment-text.ts`.
 */

/** Text eines Ticket-Dokuments für den AI-Prompt. */
export type MariDocumentText = {
  attachmentId: number;
  orgFilename: string;
  mimeType: string;
  byteLength: number;
  /** Extrahierter Fliesstext, bereits gekürzt. Leer wenn nichts lesbar war. */
  text: string;
  pageCount: number | null;
  /** Wie viele Seiten wirklich gelesen wurden (Rest = Budget gerissen). */
  pagesRead: number | null;
  /**
   * PDF ohne Textlayer (Scan/Foto). Der Inhalt ist dann NICHT bekannt —
   * das muss im Prompt stehen, sonst halluziniert das Modell den Inhalt.
   */
  needsOcr: boolean;
  /** Text wurde am Budget abgeschnitten. */
  truncated: boolean;
};

/** Dateiendungen, aus denen wir Klartext lesen können. */
const TEXTUAL_EXTENSIONS =
  /\.(txt|log|csv|md|json|xml|yml|yaml|ini|conf|sql|ps1|sh)$/i;

export function isMariPdfAttachment(mimeType: string, filename = ""): boolean {
  const m = (mimeType || "").toLowerCase();
  if (m === "application/pdf" || m === "application/x-pdf") return true;
  return /\.pdf$/i.test(filename);
}

export function isMariTextAttachment(mimeType: string, filename = ""): boolean {
  const m = (mimeType || "").toLowerCase();
  if (m.startsWith("text/")) return true;
  if (m === "application/json" || m === "application/xml") return true;
  return TEXTUAL_EXTENSIONS.test(filename);
}

/** Anhänge, aus denen die Analyse Text lesen kann (PDF + Klartext). */
export function isMariReadableDocument(
  mimeType: string,
  filename = ""
): boolean {
  return (
    isMariPdfAttachment(mimeType, filename) ||
    isMariTextAttachment(mimeType, filename)
  );
}

/**
 * Whitespace aus PDF-Textfragmenten glätten: pdfjs liefert pro Textitem
 * einzelne Runs, die sonst als Buchstabensalat im Prompt landen.
 */
export function tidyExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Dokumenttexte als Prompt-Block. Leere/gescannte Dateien werden ausdrücklich
 * als "Inhalt unbekannt" markiert, damit das Modell nichts dazuerfindet.
 */
export function formatDocumentTextsForPrompt(
  docs: readonly MariDocumentText[]
): string {
  if (docs.length === 0) return "";
  const blocks = docs.map((doc, i) => {
    const pages =
      doc.pageCount != null
        ? ` · ${doc.pageCount} Seite(n)${
            doc.pagesRead != null && doc.pagesRead < doc.pageCount
              ? `, davon ${doc.pagesRead} gelesen`
              : ""
          }`
        : "";
    const head = `[Dokument ${i + 1}] ${doc.orgFilename}${pages}`;
    if (doc.needsOcr) {
      return `${head}\nINHALT UNBEKANNT: PDF ohne Textlayer (Scan/Foto). Nicht raten, was drinsteht — in completeness.notes vermerken und manuelle Sichtung als Support-To-Do vorschlagen.`;
    }
    if (!doc.text) {
      return `${head}\nINHALT UNBEKANNT: kein Text extrahierbar. Nicht raten.`;
    }
    const tail = doc.truncated
      ? "\n(… Dokument gekürzt — nicht behaupten, es sei vollständig gelesen.)"
      : "";
    return `${head}\n${doc.text}${tail}`;
  });
  return `Dokument-Anhänge (Volltext, vom Support zur Analyse ausgewählt):
${blocks.join("\n\n")}`;
}
