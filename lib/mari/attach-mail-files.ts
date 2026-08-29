import { postMariFileAttachment } from "@/lib/mari/attachments";
import {
  downloadMicrosoftAttachment,
  listMicrosoftMessageAttachments,
  listMicrosoftTicketFileAttachments,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/microsoft/mail-attachments";

const MAX_TICKET_FILE_BYTES = 12 * 1024 * 1024;

export type MailTicketAttachResult = {
  attached: Array<{ name: string; attachmentId: number }>;
  errors: string[];
};

/**
 * Outlook-Anhänge (Graph) nach Ticket-Anlage an MARI POST /api/SupportIssueAttachment.
 */
export async function attachMicrosoftMailFilesToTicket(input: {
  userId: number;
  messageId: string;
  issueId: number;
  attachmentIds?: string[] | null;
  strippedContentIds?: string[] | null;
}): Promise<MailTicketAttachResult> {
  const attached: MailTicketAttachResult["attached"] = [];
  const errors: string[] = [];
  const listed = await listMicrosoftMessageAttachments(
    input.userId,
    input.messageId
  );
  const wanted = new Set(
    (input.attachmentIds || []).map((id) => id.trim()).filter(Boolean)
  );
  const files = listMicrosoftTicketFileAttachments(
    listed,
    input.strippedContentIds || undefined
  ).filter((a) => (wanted.size === 0 ? true : wanted.has(a.id)));

  for (const file of files) {
    try {
      if (file.size > MAX_TICKET_FILE_BYTES) {
        errors.push(`${file.name}: zu gross (max. 12 MB)`);
        continue;
      }
      const bytes = await downloadMicrosoftAttachment(
        input.userId,
        input.messageId,
        file.id
      );
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        errors.push(`${file.name}: zu gross`);
        continue;
      }
      const posted = await postMariFileAttachment({
        issueId: input.issueId,
        filename: file.name,
        mimeType: file.contentType,
        bytes,
      });
      attached.push({ name: file.name, attachmentId: posted.attachmentId });
    } catch (err) {
      errors.push(
        `${file.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return { attached, errors };
}
