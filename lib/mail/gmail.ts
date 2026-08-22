/** Shared mail types (historically Gmail-shaped; used by Microsoft inbox too). */

export type MailListFilter = "today" | "week" | "unread";

export type MailListItem = {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  date: string | null;
  internalDate: string | null;
  unread: boolean;
  hasAttachments?: boolean;
  labelIds?: string[];
};

export type MailAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type MailMessage = MailListItem & {
  to: string | null;
  cc?: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  attachments?: MailAttachment[];
};

export type MailMessageDetail = MailMessage;
