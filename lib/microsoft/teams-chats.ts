import { graphJson, getMicrosoftMe, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { previewText, stripGraphHtml } from "@/lib/microsoft/teams-text";

export type TeamsChatType = "oneOnOne" | "group" | "meeting" | "unknown";

export type TeamsChatListItem = {
  id: string;
  title: string;
  chatType: TeamsChatType;
  lastUpdatedAt: string | null;
  preview: string | null;
  webUrl: string | null;
  joinUrl: string | null;
  memberNames: string[];
};

export type TeamsChatMessage = {
  id: string;
  createdAt: string | null;
  from: string | null;
  text: string;
};

type GraphChat = {
  id?: string;
  topic?: string | null;
  chatType?: string | null;
  lastUpdatedDateTime?: string | null;
  webUrl?: string | null;
  onlineMeetingInfo?: { joinWebUrl?: string | null } | null;
  members?: Array<{
    displayName?: string | null;
    email?: string | null;
    userId?: string | null;
  }>;
  lastMessagePreview?: {
    createdDateTime?: string | null;
    body?: { content?: string | null } | null;
    from?: { user?: { displayName?: string | null } | null } | null;
  } | null;
};

type GraphChatMessage = {
  id?: string;
  createdDateTime?: string | null;
  deletedDateTime?: string | null;
  messageType?: string | null;
  from?: { user?: { displayName?: string | null } | null } | null;
  body?: { content?: string | null; contentType?: string | null } | null;
};

function asChatType(raw: string | null | undefined): TeamsChatType {
  if (raw === "oneOnOne" || raw === "group" || raw === "meeting") return raw;
  return "unknown";
}

function chatTitle(chat: GraphChat, myId: string | null): string {
  const topic = chat.topic?.trim();
  if (topic) return topic;
  const names = (chat.members || [])
    .map((m) => m.displayName?.trim())
    .filter((n): n is string => Boolean(n));
  const others = myId
    ? (chat.members || [])
        .filter((m) => m.userId && m.userId !== myId)
        .map((m) => m.displayName?.trim())
        .filter((n): n is string => Boolean(n))
    : names;
  if (others.length) return others.slice(0, 3).join(", ");
  if (names.length) return names.slice(0, 3).join(", ");
  if (chat.chatType === "meeting") return "Meeting-Chat";
  if (chat.chatType === "group") return "Gruppenchat";
  return "Chat";
}

export async function listTeamsChats(
  userId: number,
  options?: { top?: number }
): Promise<TeamsChatListItem[]> {
  const top = Math.min(Math.max(options?.top ?? 40, 1), 50);
  let meId: string | null = null;
  try {
    meId = (await getMicrosoftMe(userId)).id;
  } catch {
    meId = null;
  }

  const qs = new URLSearchParams({
    $top: String(top),
    $select: "id,topic,chatType,lastUpdatedDateTime,webUrl,onlineMeetingInfo",
    $expand: "members,lastMessagePreview",
  });
  let data: { value?: GraphChat[] };
  try {
    data = await graphJson<{ value?: GraphChat[] }>(
      userId,
      `/me/chats?${qs}`
    );
  } catch (error) {
    if (!(error instanceof MicrosoftGraphError)) throw error;
    const plain = new URLSearchParams({
      $top: String(top),
      $select: "id,topic,chatType,lastUpdatedDateTime,webUrl,onlineMeetingInfo",
    });
    data = await graphJson<{ value?: GraphChat[] }>(
      userId,
      `/me/chats?${plain}`
    );
  }
  const items: TeamsChatListItem[] = [];
  for (const chat of data.value || []) {
    if (!chat.id) continue;
    const previewRaw = stripGraphHtml(chat.lastMessagePreview?.body?.content);
    items.push({
      id: chat.id,
      title: chatTitle(chat, meId),
      chatType: asChatType(chat.chatType),
      lastUpdatedAt:
        chat.lastMessagePreview?.createdDateTime ||
        chat.lastUpdatedDateTime ||
        null,
      preview: previewRaw ? previewText(previewRaw, 96) : null,
      webUrl: chat.webUrl || null,
      joinUrl: chat.onlineMeetingInfo?.joinWebUrl || null,
      memberNames: (chat.members || [])
        .map((m) => m.displayName?.trim())
        .filter((n): n is string => Boolean(n))
        .slice(0, 6),
    });
  }
  items.sort((a, b) =>
    (b.lastUpdatedAt || "").localeCompare(a.lastUpdatedAt || "")
  );
  return items;
}

/** Newest listed chat for Home — same Graph path as Teams → Chats. */
export async function getLatestTeamsChatSnippet(userId: number): Promise<{
  chatId: string;
  title: string;
  preview: string | null;
  lastUpdatedAt: string | null;
} | null> {
  const chats = await listTeamsChats(userId, { top: 8 });
  const chat =
    chats.find((c) => c.lastUpdatedAt || c.preview) || chats[0] || null;
  if (!chat) return null;
  return {
    chatId: chat.id,
    title: chat.title,
    preview: chat.preview,
    lastUpdatedAt: chat.lastUpdatedAt,
  };
}

export async function listTeamsChatMessages(
  userId: number,
  chatId: string,
  options?: { top?: number }
): Promise<TeamsChatMessage[]> {
  const id = chatId.trim();
  if (!id) return [];
  const top = Math.min(Math.max(options?.top ?? 40, 1), 80);
  const qs = new URLSearchParams({
    $top: String(top),
  });
  const data = await graphJson<{ value?: GraphChatMessage[] }>(
    userId,
    `/me/chats/${encodeURIComponent(id)}/messages?${qs}`
  );
  const out: TeamsChatMessage[] = [];
  for (const msg of data.value || []) {
    if (!msg.id || msg.deletedDateTime) continue;
    if (msg.messageType && msg.messageType !== "message") continue;
    const text = stripGraphHtml(msg.body?.content);
    if (!text) continue;
    out.push({
      id: msg.id,
      createdAt: msg.createdDateTime || null,
      from: msg.from?.user?.displayName?.trim() || null,
      text,
    });
  }
  out.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return out;
}

export async function findMeetingChatByJoinUrl(
  userId: number,
  joinUrl: string
): Promise<TeamsChatListItem | null> {
  const target = joinUrl.trim();
  if (!target) return null;
  try {
    const chats = await listTeamsChats(userId, { top: 50 });
    return (
      chats.find(
        (c) =>
          c.chatType === "meeting" &&
          c.joinUrl &&
          normalizeJoinUrl(c.joinUrl) === normalizeJoinUrl(target)
      ) || null
    );
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      return null;
    }
    throw error;
  }
}

export function normalizeJoinUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
