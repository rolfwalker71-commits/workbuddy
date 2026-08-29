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
  calendarEventId: string | null;
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
  onlineMeetingInfo?: {
    joinWebUrl?: string | null;
    calendarEventId?: string | null;
  } | null;
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

export function asChatType(raw: string | null | undefined): TeamsChatType {
  if (raw === "oneOnOne" || raw === "group" || raw === "meeting") return raw;
  return "unknown";
}

export function mapGraphChat(
  chat: GraphChat,
  myId: string | null
): TeamsChatListItem | null {
  if (!chat.id) return null;
  const previewRaw = stripGraphHtml(chat.lastMessagePreview?.body?.content);
  return {
    id: chat.id,
    title: chatTitle(chat, myId),
    chatType: asChatType(chat.chatType),
    lastUpdatedAt:
      chat.lastMessagePreview?.createdDateTime ||
      chat.lastUpdatedDateTime ||
      null,
    preview: previewRaw ? previewText(previewRaw, 96) : null,
    webUrl: chat.webUrl || null,
    joinUrl: chat.onlineMeetingInfo?.joinWebUrl?.trim() || null,
    calendarEventId: chat.onlineMeetingInfo?.calendarEventId?.trim() || null,
    memberNames: (chat.members || [])
      .map((m) => m.displayName?.trim())
      .filter((n): n is string => Boolean(n))
      .slice(0, 6),
  };
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
    const item = mapGraphChat(chat, meId);
    if (item) items.push(item);
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

export async function getTeamsChat(
  userId: number,
  chatId: string
): Promise<TeamsChatListItem | null> {
  const id = chatId.trim();
  if (!id) return null;
  try {
    const chat = await graphJson<GraphChat>(
      userId,
      `/me/chats/${encodeURIComponent(id)}?$select=id,topic,chatType,lastUpdatedDateTime,webUrl,onlineMeetingInfo`
    );
    return mapGraphChat(chat, null);
  } catch (error) {
    if (
      error instanceof MicrosoftGraphError &&
      (error.status === 403 || error.status === 404)
    ) {
      return null;
    }
    throw error;
  }
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

export type TeamsChatPeer = {
  chatId: string;
  microsoftId: string | null;
  email: string | null;
  displayName: string | null;
};

function normEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

function otherChatMembers(
  members: GraphChat["members"],
  myId: string | null
): NonNullable<GraphChat["members"]> {
  return (members || []).filter((m) => {
    const uid = m.userId?.trim();
    if (myId && uid && uid === myId) return false;
    return Boolean(uid || m.email?.trim() || m.displayName?.trim());
  });
}

export function oneOnOneChatMatchesPeer(
  members: GraphChat["members"],
  myId: string | null,
  target: { microsoftId?: string | null; email?: string | null }
): boolean {
  const wantId = target.microsoftId?.trim() || "";
  const wantEmail = normEmail(target.email);
  if (!wantId && !wantEmail) return false;
  return otherChatMembers(members, myId).some((m) => {
    const uid = m.userId?.trim() || "";
    const email = normEmail(m.email);
    return (wantId && uid === wantId) || (wantEmail && email === wantEmail);
  });
}

/** 1:1 / notes chat that only contains the signed-in user (Chat with self). */
export function isSelfOnlyChat(
  members: GraphChat["members"],
  myId: string | null
): boolean {
  const list = members || [];
  if (!list.length || !myId) return false;
  if (otherChatMembers(list, myId).length > 0) return false;
  return list.some((m) => m.userId?.trim() === myId);
}

export function targetIsSelfPeer(
  me: { id?: string | null; mail?: string | null; userPrincipalName?: string | null },
  target: { microsoftId?: string | null; email?: string | null }
): boolean {
  const meId = me.id?.trim() || "";
  const wantId = target.microsoftId?.trim() || "";
  if (meId && wantId && meId === wantId) return true;
  const wantEmail = normEmail(target.email);
  if (!wantEmail) return false;
  return (
    normEmail(me.mail) === wantEmail ||
    normEmail(me.userPrincipalName) === wantEmail
  );
}

export function teamsChatUserMessage(
  error: unknown,
  missingScope: "Chat.Create" | "ChatMessage.Send"
): string | null {
  if (!(error instanceof MicrosoftGraphError)) return null;
  if (error.status === 403) {
    return `${missingScope} fehlt. Unter Konto Microsoft 365 neu verbinden.`;
  }
  if (error.status === 405) {
    return "Teams erlaubt diese Chat-Aktion nicht. Unter Konto Microsoft 365 neu verbinden.";
  }
  if (error.status === 400) {
    return missingScope === "Chat.Create"
      ? "Teams hat den Chat nicht angelegt. Bitte später erneut versuchen."
      : "Teams hat die Nachricht nicht angenommen. Bitte später erneut versuchen.";
  }
  return `Teams hat die Aktion nicht angenommen (Fehler ${error.status}). Bitte später erneut versuchen.`;
}

function throwTeamsChatGraphError(
  error: unknown,
  missingScope: "Chat.Create" | "ChatMessage.Send"
): never {
  const message = teamsChatUserMessage(error, missingScope);
  if (message) throw new Error(message);
  throw error;
}

async function listGraphChatsWithMembers(
  userId: number
): Promise<{ chats: GraphChat[]; myId: string | null }> {
  let myId: string | null = null;
  try {
    myId = (await getMicrosoftMe(userId)).id;
  } catch {
    myId = null;
  }
  const qs = new URLSearchParams({
    $top: "50",
    $select: "id,topic,chatType,lastUpdatedDateTime",
    $expand: "members",
    $filter: "chatType eq 'oneOnOne'",
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
      $top: "50",
      $expand: "members",
    });
    data = await graphJson<{ value?: GraphChat[] }>(
      userId,
      `/me/chats?${plain}`
    );
  }
  return { chats: data.value || [], myId };
}

/** 1:1 chat partners we can resolve without User.Read.All. */
export async function listOneOnOneChatPeers(
  userId: number
): Promise<TeamsChatPeer[]> {
  try {
    const { chats, myId } = await listGraphChatsWithMembers(userId);
    const out: TeamsChatPeer[] = [];
    const seen = new Set<string>();
    for (const chat of chats) {
      if (!chat.id || asChatType(chat.chatType) !== "oneOnOne") continue;
      const others = otherChatMembers(chat.members, myId);
      const other = others[0];
      if (!other) continue;
      const microsoftId = other.userId?.trim() || null;
      const email = other.email?.trim() || null;
      const key = (microsoftId || email || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        chatId: chat.id,
        microsoftId,
        email,
        displayName: other.displayName?.trim() || null,
      });
    }
    return out;
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      return [];
    }
    throw error;
  }
}

export async function findExistingOneOnOneChat(
  userId: number,
  target: { microsoftId?: string | null; email?: string | null }
): Promise<string | null> {
  if (!target.microsoftId?.trim() && !target.email?.trim()) return null;
  try {
    const { chats, myId } = await listGraphChatsWithMembers(userId);
    for (const chat of chats) {
      if (!chat.id || asChatType(chat.chatType) !== "oneOnOne") continue;
      if (oneOnOneChatMatchesPeer(chat.members, myId, target)) return chat.id;
    }
    return null;
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      return null;
    }
    throw error;
  }
}

function memberBinding(userKey: string) {
  return {
    "@odata.type": "#microsoft.graph.aadUserConversationMember",
    roles: ["owner"],
    "kevin.m@example.com": `https://graph.microsoft.com/v1.0/users('${userKey.replace(/'/g, "")}')`,
  };
}

async function postCreateChat(
  userId: number,
  members: ReturnType<typeof memberBinding>[]
): Promise<string> {
  try {
    const created = await graphJson<{ id?: string }>(userId, "/chats", {
      method: "POST",
      body: JSON.stringify({
        chatType: "oneOnOne",
        members,
      }),
    });
    if (!created.id) {
      throw new Error("Teams hat keine Chat-Id zurückgegeben.");
    }
    return created.id;
  } catch (error) {
    throwTeamsChatGraphError(error, "Chat.Create");
  }
}

export async function findExistingSelfChat(
  userId: number
): Promise<string | null> {
  try {
    const { chats, myId } = await listGraphChatsWithMembers(userId);
    if (!myId) return null;
    for (const chat of chats) {
      if (!chat.id) continue;
      const type = asChatType(chat.chatType);
      if (type !== "oneOnOne" && type !== "unknown") continue;
      if (isSelfOnlyChat(chat.members, myId)) return chat.id;
    }
    return null;
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      return null;
    }
    throw error;
  }
}

/** POST /chats with only the current user — Graph «chat with self». */
export async function createSelfChat(userId: number): Promise<string> {
  let meId: string | null = null;
  try {
    meId = (await getMicrosoftMe(userId)).id?.trim() || null;
  } catch {
    meId = null;
  }
  if (!meId) {
    throw new Error(
      "Microsoft-Konto ohne Benutzer-Id. Unter Konto Microsoft 365 neu verbinden."
    );
  }
  try {
    return await postCreateChat(userId, [memberBinding(meId)]);
  } catch (error) {
    const existing = await findExistingSelfChat(userId);
    if (existing) return existing;
    if (
      error instanceof Error &&
      /Chat\.Create fehlt|neu verbinden/i.test(error.message)
    ) {
      throw error;
    }
    throw new Error(
      "Teams hat den Selbst-Chat nicht angelegt. Öffne in Teams einmal «Chat mit dir selbst», dann hier erneut senden."
    );
  }
}

export async function getOrCreateSelfChat(
  userId: number
): Promise<{ chatId: string; created: boolean }> {
  const existing = await findExistingSelfChat(userId);
  if (existing) return { chatId: existing, created: false };
  const chatId = await createSelfChat(userId);
  return { chatId, created: true };
}

/** POST /chats — Chat.Create. Graph may return an existing 1:1. */
export async function createOneOnOneChat(
  userId: number,
  target: { microsoftId?: string | null; email?: string | null }
): Promise<string> {
  const otherKey = target.microsoftId?.trim() || target.email?.trim() || "";
  if (!otherKey) {
    throw new Error("Kollege hat keine Microsoft-Id und keine E-Mail.");
  }
  let me: Awaited<ReturnType<typeof getMicrosoftMe>> | null = null;
  try {
    me = await getMicrosoftMe(userId);
  } catch {
    me = null;
  }
  if (me && targetIsSelfPeer(me, target)) {
    return createSelfChat(userId);
  }
  const meId = me?.id?.trim() || null;
  const members = meId
    ? [memberBinding(meId), memberBinding(otherKey)]
    : [memberBinding(otherKey)];
  return postCreateChat(userId, members);
}

export async function getOrCreateOneOnOneChat(
  userId: number,
  target: { microsoftId?: string | null; email?: string | null }
): Promise<{ chatId: string; created: boolean }> {
  let me: Awaited<ReturnType<typeof getMicrosoftMe>> | null = null;
  try {
    me = await getMicrosoftMe(userId);
  } catch {
    me = null;
  }
  if (me && targetIsSelfPeer(me, target)) {
    return getOrCreateSelfChat(userId);
  }
  const existing = await findExistingOneOnOneChat(userId, target);
  if (existing) return { chatId: existing, created: false };
  const chatId = await createOneOnOneChat(userId, target);
  return { chatId, created: true };
}
