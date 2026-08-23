import { google } from "googleapis";
import { getAuthedGoogleClient } from "@/lib/google/oauth";

export type GmailInboxExcerpt = {
  id: string;
  subject: string;
  from: string;
  receivedOrSentAt: string | null;
};

/** Parse Gmail `users.labels.get(INBOX)` unread metadata. */
export function parseGmailUnreadCount(label: {
  messagesUnread?: number | null;
}): number | null {
  const n = label.messagesUnread;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : null;
}

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string | null {
  const hit = (headers || []).find(
    (h) => (h.name || "").toLowerCase() === name.toLowerCase()
  );
  return hit?.value?.trim() || null;
}

function parseFromHeader(raw: string | null): string {
  if (!raw) return "Gmail";
  const m = /^(?:"?([^"<]*)"?\s*)?<(.*)>$/.exec(raw);
  if (m) return (m[1] || "").trim() || m[2] || "Gmail";
  return raw;
}

/** Map Gmail metadata headers to a home mail sample. */
export function parseGmailExcerptHeaders(
  id: string,
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  internalDate?: string | null
): GmailInboxExcerpt {
  const dateHeader = headerValue(headers, "Date");
  let receivedOrSentAt: string | null = null;
  if (internalDate && /^\d+$/.test(internalDate)) {
    receivedOrSentAt = new Date(Number(internalDate)).toISOString();
  } else if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (Number.isFinite(parsed.getTime())) receivedOrSentAt = parsed.toISOString();
  }
  return {
    id,
    subject: headerValue(headers, "Subject") || "(kein Betreff)",
    from: parseFromHeader(headerValue(headers, "From")),
    receivedOrSentAt,
  };
}

/** Inbox unread count from Gmail INBOX label metadata (cheap, not a message list). */
export async function getGmailInboxUnreadCount(
  userId: number,
  request?: Request | null
): Promise<number | null> {
  try {
    const auth = await getAuthedGoogleClient(userId, request);
    const gmail = google.gmail({ version: "v1", auth });
    const label = await gmail.users.labels.get({
      userId: "me",
      id: "INBOX",
    });
    return parseGmailUnreadCount({
      messagesUnread: label.data.messagesUnread,
    });
  } catch {
    return null;
  }
}

/** Latest inbox rows via metadata only (no full bodies / thread expand). */
export async function getGmailInboxExcerpt(
  userId: number,
  limit = 4,
  request?: Request | null
): Promise<GmailInboxExcerpt[]> {
  try {
    const auth = await getAuthedGoogleClient(userId, request);
    const gmail = google.gmail({ version: "v1", auth });
    const listed = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults: Math.min(8, Math.max(1, limit)),
    });
    const ids = (listed.data.messages || [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id))
      .slice(0, limit);
    const rows = await Promise.all(
      ids.map(async (id) => {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });
        return parseGmailExcerptHeaders(
          id,
          msg.data.payload?.headers,
          msg.data.internalDate
        );
      })
    );
    return rows;
  } catch {
    return [];
  }
}
