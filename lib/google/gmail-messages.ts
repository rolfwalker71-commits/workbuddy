import { google, type gmail_v1 } from "googleapis";
import { getAuthedGoogleClient } from "@/lib/google/oauth";
import type {
  MailListFilter,
  MailListItem,
  MailMessageDetail,
} from "@/lib/mail/gmail";

function zurichYmdParts(d = new Date()): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value || 0);
  return { y: get("year"), m: get("month"), day: get("day") };
}

export function gmailQueryForFilter(filter: MailListFilter): string {
  if (filter === "unread") return "in:inbox is:unread";
  if (filter === "week") return "in:inbox newer_than:7d";
  const { y, m, day } = zurichYmdParts();
  return `in:inbox after:${y}/${m}/${day}`;
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | null {
  const hit = (headers || []).find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return hit?.value?.trim() || null;
}

function parseFrom(raw: string | null): { from: string; fromName: string } {
  if (!raw) return { from: "", fromName: "Unbekannt" };
  const m = /^(?:"?([^"<]*)"?\s*)?<(.*)>$/.exec(raw);
  if (m) {
    const name = (m[1] || "").trim() || m[2];
    return { from: m[2], fromName: name };
  }
  return { from: raw, fromName: raw };
}

function decodeBodyData(data: string | undefined | null): string {
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function extractBodies(part: gmail_v1.Schema$MessagePart | undefined): {
  text: string | null;
  html: string | null;
} {
  if (!part) return { text: null, html: null };
  let text: string | null = null;
  let html: string | null = null;
  const walk = (p: gmail_v1.Schema$MessagePart) => {
    const mime = (p.mimeType || "").toLowerCase();
    if (mime === "text/plain" && p.body?.data && !text) {
      text = decodeBodyData(p.body.data);
    }
    if (mime === "text/html" && p.body?.data && !html) {
      html = decodeBodyData(p.body.data);
    }
    for (const child of p.parts || []) walk(child);
  };
  walk(part);
  return { text, html };
}

function mapListItem(msg: gmail_v1.Schema$Message): MailListItem {
  const headers = msg.payload?.headers;
  const fromRaw = headerValue(headers, "From");
  const { from, fromName } = parseFrom(fromRaw);
  const labelIds = msg.labelIds || [];
  return {
    id: msg.id || "",
    threadId: msg.threadId || "",
    from,
    fromName,
    subject: headerValue(headers, "Subject") || "(kein Betreff)",
    snippet: (msg.snippet || "").trim(),
    date: headerValue(headers, "Date"),
    internalDate: msg.internalDate || null,
    unread: labelIds.includes("UNREAD"),
    labelIds,
  };
}

type CacheEntry = { at: number; items: MailListItem[] };
const listCache = new Map<string, CacheEntry>();
const LIST_CACHE_TTL_MS = 2 * 60 * 1000;

export async function listGmailMessages(
  userId: number,
  options: {
    filter: MailListFilter;
    limit?: number;
    request?: Request | null;
    forceRefresh?: boolean;
  }
): Promise<MailListItem[]> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const cacheKey = `${userId}:${options.filter}:${limit}`;
  const cached = listCache.get(cacheKey);
  if (
    !options.forceRefresh &&
    cached &&
    Date.now() - cached.at < LIST_CACHE_TTL_MS
  ) {
    return cached.items;
  }

  const auth = await getAuthedGoogleClient(userId, options.request);
  const gmail = google.gmail({ version: "v1", auth });
  const listed = await gmail.users.messages.list({
    userId: "me",
    q: gmailQueryForFilter(options.filter),
    maxResults: limit,
  });
  const ids = (listed.data.messages || [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  const items: MailListItem[] = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    if (msg.data.id) items.push(mapListItem(msg.data));
  }

  if (options.filter !== "unread") {
    items.sort((a, b) => Number(b.unread) - Number(a.unread));
  }

  listCache.set(cacheKey, { at: Date.now(), items });
  return items;
}

export async function getGmailMessage(
  userId: number,
  messageId: string,
  request?: Request | null
): Promise<MailMessageDetail> {
  const auth = await getAuthedGoogleClient(userId, request);
  const gmail = google.gmail({ version: "v1", auth });
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  if (!msg.data.id) throw new Error("Mail nicht gefunden.");
  const base = mapListItem(msg.data);
  const headers = msg.data.payload?.headers;
  const bodies = extractBodies(msg.data.payload);
  return {
    ...base,
    to: headerValue(headers, "To"),
    bodyText: bodies.text,
    bodyHtml: bodies.html,
  };
}

export function invalidateGmailListCache(userId?: number): void {
  if (userId == null) {
    listCache.clear();
    return;
  }
  for (const key of listCache.keys()) {
    if (key.startsWith(`${userId}:`)) listCache.delete(key);
  }
}
