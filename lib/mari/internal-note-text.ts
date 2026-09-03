/** Strip Buddy chrome so an existing internal note can be edited as plain text. */
export function stripBuddyInternalNoteChrome(text: string): string {
  let out = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  out = out.replace(/^(Interner Kommentar|Buddy AI-Analyse)\n+/i, "");
  out = out.replace(/^Nur intern[^\n]*\n+/i, "");
  out = out.replace(/^Ticket #\d+\n+/i, "");
  out = out.replace(/\n+(Manuell|Automatisch) aus Buddy[^\n]*$/i, "");
  return out.trim();
}
