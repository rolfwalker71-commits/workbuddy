import {
  graphJson,
  getMicrosoftMe,
  MicrosoftGraphError,
  type MicrosoftMe,
} from "@/lib/microsoft/graph";
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
    user?: { id?: string | null; displayName?: string | null } | null;
  }>;
  isHiddenForAllMembers?: boolean | null;
  viewpoint?: { isHidden?: boolean | null } | null;
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

type ChatMeLike = {
  id?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
};

function meEmailsFrom(
  myEmails?: Array<string | null | undefined>
): Set<string> {
  return new Set((myEmails || []).map(normEmail).filter(Boolean));
}

function memberUserId(
  member: NonNullable<GraphChat["members"]>[number]
): string {
  return member.userId?.trim() || member.user?.id?.trim() || "";
}

function memberIsMe(
  member: NonNullable<GraphChat["members"]>[number],
  myId: string | null,
  myEmails: Set<string>
): boolean {
  const uid = memberUserId(member);
  if (myId && uid && uid === myId) return true;
  const email = normEmail(member.email);
  return Boolean(email && myEmails.has(email));
}

function otherChatMembers(
  members: GraphChat["members"],
  myId: string | null,
  myEmails?: Array<string | null | undefined>
): NonNullable<GraphChat["members"]> {
  const emails = meEmailsFrom(myEmails);
  return (members || []).filter((m) => {
    if (memberIsMe(m, myId, emails)) return false;
    return Boolean(
      memberUserId(m) || m.email?.trim() || m.displayName?.trim()
    );
  });
}

/** Someone else with an AAD id or email — displayName alone is not a peer. */
function identifiedOtherMembers(
  members: GraphChat["members"],
  myId: string | null,
  myEmails?: Array<string | null | undefined>
): NonNullable<GraphChat["members"]> {
  const emails = meEmailsFrom(myEmails);
  return (members || []).filter((m) => {
    if (memberIsMe(m, myId, emails)) return false;
    return Boolean(memberUserId(m) || m.email?.trim());
  });
}

export function oneOnOneChatMatchesPeer(
  members: GraphChat["members"],
  myId: string | null,
  target: { microsoftId?: string | null; email?: string | null },
  myEmails?: Array<string | null | undefined>
): boolean {
  const wantId = target.microsoftId?.trim() || "";
  const wantEmail = normEmail(target.email);
  if (!wantId && !wantEmail) return false;
  return otherChatMembers(members, myId, myEmails).some((m) => {
    const uid = memberUserId(m);
    const email = normEmail(m.email);
    return (wantId && uid === wantId) || (wantEmail && email === wantEmail);
  });
}

/** 1:1 / notes chat that only contains the signed-in user (Chat with self). */
export function isSelfOnlyChat(
  members: GraphChat["members"],
  myId: string | null,
  myEmails?: Array<string | null | undefined>
): boolean {
  const list = members || [];
  if (identifiedOtherMembers(list, myId, myEmails).length > 0) return false;
  if (list.length === 1) return true;
  if (!list.length) return false;
  const emails = meEmailsFrom(myEmails);
  if (!myId && emails.size === 0) return false;
  return list.some((m) => memberIsMe(m, myId, emails));
}

/** Graph topic for «Chat with yourself» / «Chat mit dir selbst». */
export function selfChatTopicMatch(
  topic: string | null | undefined
): boolean {
  const t = (topic || "").normalize("NFKC").trim().toLowerCase();
  if (!t) return false;
  if (/\bchat with (your)?self\b/.test(t)) return true;
  if (/\bchat mit (dir|mir|sich) selbst\b/.test(t)) return true;
  if (t === "chat mit mir" || t === "chat with me") return true;
  if (/\bselbst-?chat\b/.test(t)) return true;
  if (t === "notes") return true;
  if (/\byourself\b/.test(t)) return true;
  return /\bchat\b/.test(t) && /\bselbst\b/.test(t);
}

/** Self-chat: all members are me, one member, or Selbst/yourself topic. */
export function chatLooksLikeSelfChat(
  chat: Pick<GraphChat, "chatType" | "topic" | "members">,
  myId: string | null,
  myEmails?: Array<string | null | undefined>
): boolean {
  const type = asChatType(chat.chatType);
  if (type !== "oneOnOne" && type !== "unknown") return false;
  if (selfChatTopicMatch(chat.topic)) {
    const identifiable =
      Boolean(myId) || meEmailsFrom(myEmails).size > 0;
    if (!identifiable) return (chat.members || []).length <= 1;
    return identifiedOtherMembers(chat.members, myId, myEmails).length === 0;
  }
  return isSelfOnlyChat(chat.members, myId, myEmails);
}

export function targetIsSelfPeer(
  me: ChatMeLike,
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

export function graphErrorCode(body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } };
    const code = parsed.error?.code?.trim();
    return code || null;
  } catch {
    return null;
  }
}

function graphErrorSuffix(error: MicrosoftGraphError): string {
  const code = graphErrorCode(error.body);
  return code ? `${error.status} ${code}` : `Fehler ${error.status}`;
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
      ? `Teams hat den Chat nicht angelegt (${graphErrorSuffix(error)}). Bitte später erneut versuchen.`
      : `Teams hat die Nachricht nicht angenommen (${graphErrorSuffix(error)}). Bitte später erneut versuchen.`;
  }
  return `Teams hat die Aktion nicht angenommen (${graphErrorSuffix(error)}). Bitte später erneut versuchen.`;
}

function throwTeamsChatGraphError(
  error: unknown,
  missingScope: "Chat.Create" | "ChatMessage.Send"
): never {
  if (error instanceof MicrosoftGraphError) {
    console.warn(
      `[teams-chats] ${missingScope} status=${error.status} body=${error.body.slice(0, 800)}`
    );
  }
  const message = teamsChatUserMessage(error, missingScope);
  if (message) throw new Error(message);
  throw error;
}

type GraphChatPage = {
  value?: GraphChat[];
  "@odata.nextLink"?: string;
};

const CHAT_PAGE_SIZE = 50;
const CHAT_MAX_PAGES = 20;
const CHAT_WALK_DEADLINE_MS = 12000;
const SELF_CHAT_CACHE_MS = 30 * 60 * 1000;

const selfChatIdCache = new Map<number, { chatId: string; at: number }>();

export type ChatWalkOptions = {
  maxPages?: number;
  deadlineMs?: number;
};

export function chatWalkPageLimit(options?: ChatWalkOptions): number {
  const raw = options?.maxPages ?? CHAT_MAX_PAGES;
  return Math.min(Math.max(Math.trunc(raw), 1), CHAT_MAX_PAGES);
}

export function shouldContinueChatWalk(
  nextUrl: string | null | undefined,
  pagesDone: number,
  options?: ChatWalkOptions & { startedAt?: number }
): string | null {
  const url = nextUrl?.trim() || null;
  if (!url) return null;
  if (pagesDone >= chatWalkPageLimit(options)) return null;
  const deadlineMs = options?.deadlineMs ?? CHAT_WALK_DEADLINE_MS;
  const startedAt = options?.startedAt ?? 0;
  if (startedAt > 0 && Date.now() - startedAt >= deadlineMs) return null;
  return url;
}

export function cachedSelfChatId(userId: number): string | null {
  const row = selfChatIdCache.get(userId);
  if (!row) return null;
  if (Date.now() - row.at > SELF_CHAT_CACHE_MS) {
    selfChatIdCache.delete(userId);
    return null;
  }
  return row.chatId;
}

export function rememberSelfChatId(userId: number, chatId: string): void {
  const id = chatId.trim();
  if (!id) return;
  selfChatIdCache.set(userId, { chatId: id, at: Date.now() });
}

export function clearSelfChatIdCache(userId?: number): void {
  if (userId == null) selfChatIdCache.clear();
  else selfChatIdCache.delete(userId);
}

function chatsListPath(
  kind: "filter-expand-select" | "expand-select" | "expand" | "plain"
): string {
  const qs = new URLSearchParams();
  qs.set("$top", String(CHAT_PAGE_SIZE));
  if (kind === "filter-expand-select" || kind === "expand-select") {
    qs.set("$select", "id,topic,chatType,lastUpdatedDateTime");
    qs.set("$expand", "members($select=id,displayName,email,userId)");
  } else if (kind === "expand") {
    qs.set("$expand", "members");
  }
  if (kind === "filter-expand-select") {
    qs.set("$filter", "chatType eq 'oneOnOne'");
  }
  return `/me/chats?${qs}`;
}

const CHAT_LIST_KINDS = [
  "filter-expand-select",
  "expand-select",
  "expand",
  "plain",
] as const;

async function resolveChatMe(userId: number): Promise<MicrosoftMe | null> {
  try {
    return await getMicrosoftMe(userId);
  } catch {
    return null;
  }
}

function meEmails(me: MicrosoftMe | null): string[] {
  if (!me) return [];
  return [me.mail, me.userPrincipalName].filter((v): v is string => Boolean(v));
}

async function pagedFindChat(
  userId: number,
  match: (chat: GraphChat, me: MicrosoftMe | null) => boolean,
  options?: ChatWalkOptions
): Promise<string | null> {
  const me = await resolveChatMe(userId);
  const startedAt = Date.now();
  let lastError: MicrosoftGraphError | null = null;
  for (const kind of CHAT_LIST_KINDS) {
    try {
      let url: string | null = chatsListPath(kind);
      let pages = 0;
      while (url) {
        pages += 1;
        const page = await graphJson<GraphChatPage>(userId, url);
        for (const chat of page.value || []) {
          if (chat.id && match(chat, me)) return chat.id;
        }
        url = shouldContinueChatWalk(page["@odata.nextLink"], pages, {
          ...options,
          startedAt,
        });
      }
      return null;
    } catch (error) {
      if (!(error instanceof MicrosoftGraphError)) throw error;
      lastError = error;
    }
  }
  if (lastError && lastError.status === 403) return null;
  if (lastError) throw lastError;
  return null;
}

async function listGraphChatsWithMembers(
  userId: number,
  options?: ChatWalkOptions
): Promise<{ chats: GraphChat[]; myId: string | null; me: MicrosoftMe | null }> {
  const me = await resolveChatMe(userId);
  const myId = me?.id?.trim() || null;
  const startedAt = Date.now();
  let lastError: MicrosoftGraphError | null = null;
  for (const kind of CHAT_LIST_KINDS) {
    try {
      const chats: GraphChat[] = [];
      let url: string | null = chatsListPath(kind);
      let pages = 0;
      while (url) {
        pages += 1;
        const page = await graphJson<GraphChatPage>(userId, url);
        chats.push(...(page.value || []));
        url = shouldContinueChatWalk(page["@odata.nextLink"], pages, {
          ...options,
          startedAt,
        });
      }
      return { chats, myId, me };
    } catch (error) {
      if (!(error instanceof MicrosoftGraphError)) throw error;
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return { chats: [], myId, me };
}

/** 1:1 chat partners we can resolve without User.Read.All. */
export async function listOneOnOneChatPeers(
  userId: number,
  options?: ChatWalkOptions
): Promise<TeamsChatPeer[]> {
  try {
    const { chats, myId, me } = await listGraphChatsWithMembers(userId, options);
    const emails = meEmails(me);
    const out: TeamsChatPeer[] = [];
    const seen = new Set<string>();
    for (const chat of chats) {
      if (!chat.id || asChatType(chat.chatType) !== "oneOnOne") continue;
      const others = otherChatMembers(chat.members, myId, emails);
      const other = others[0];
      if (!other) continue;
      const microsoftId = memberUserId(other) || null;
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
    return await pagedFindChat(userId, (chat, me) => {
      const type = asChatType(chat.chatType);
      if (type !== "oneOnOne" && type !== "unknown") return false;
      return oneOnOneChatMatchesPeer(
        chat.members,
        me?.id?.trim() || null,
        target,
        meEmails(me)
      );
    });
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

function selfChatTopicListPath(): string {
  const qs = new URLSearchParams({
    $top: String(CHAT_PAGE_SIZE),
    $select: "id,topic,chatType",
    $filter: "chatType eq 'oneOnOne'",
  });
  return `/me/chats?${qs}`;
}

/** First pages of 1:1 chats by topic — no member expand, no full mailbox crawl. */
async function findSelfChatByTopic(
  userId: number,
  me: MicrosoftMe | null
): Promise<string | null> {
  let url: string | null = selfChatTopicListPath();
  let pages = 0;
  const startedAt = Date.now();
  while (url) {
    pages += 1;
    const page = await graphJson<GraphChatPage>(userId, url);
    for (const chat of page.value || []) {
      if (
        chat.id &&
        chatLooksLikeSelfChat(chat, me?.id?.trim() || null, meEmails(me))
      ) {
        return chat.id;
      }
    }
    url = shouldContinueChatWalk(page["@odata.nextLink"], pages, {
      maxPages: 2,
      deadlineMs: 8000,
      startedAt,
    });
  }
  return null;
}

export async function findExistingSelfChat(
  userId: number
): Promise<string | null> {
  const cached = cachedSelfChatId(userId);
  if (cached) return cached;
  try {
    const me = await resolveChatMe(userId);
    try {
      const byTopic = await findSelfChatByTopic(userId, me);
      if (byTopic) {
        rememberSelfChatId(userId, byTopic);
        return byTopic;
      }
    } catch (error) {
      if (!(error instanceof MicrosoftGraphError)) throw error;
    }
    const found = await pagedFindChat(
      userId,
      (chat, currentMe) =>
        chatLooksLikeSelfChat(
          chat,
          currentMe?.id?.trim() || null,
          meEmails(currentMe)
        ),
      { maxPages: 6, deadlineMs: CHAT_WALK_DEADLINE_MS }
    );
    if (found) rememberSelfChatId(userId, found);
    return found;
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      return null;
    }
    throw error;
  }
}

/** Graph does not reliably create self-chat — reuse the existing thread. */
export async function createSelfChat(userId: number): Promise<string> {
  const existing = await findExistingSelfChat(userId);
  if (existing) return existing;

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
    const created = await postCreateChat(userId, [memberBinding(meId)]);
    rememberSelfChatId(userId, created);
    return created;
  } catch (error) {
    const again = await findExistingSelfChat(userId);
    if (again) return again;
    if (
      error instanceof Error &&
      /Chat\.Create fehlt|neu verbinden/i.test(error.message)
    ) {
      throw error;
    }
    const detail =
      error instanceof Error && error.message.trim()
        ? ` ${error.message}`
        : "";
    throw new Error(
      `Selbst-Chat in der Teams-Liste nicht gefunden.${detail}`.trim()
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

/** POST /chats — both members required. Graph may return an existing 1:1. */
export async function createOneOnOneChat(
  userId: number,
  target: { microsoftId?: string | null; email?: string | null }
): Promise<string> {
  const otherKey = target.microsoftId?.trim() || target.email?.trim() || "";
  if (!otherKey) {
    throw new Error("Kollege hat keine Microsoft-Id und keine E-Mail.");
  }
  let me: MicrosoftMe | null = null;
  try {
    me = await getMicrosoftMe(userId);
  } catch {
    me = null;
  }
  if (me && targetIsSelfPeer(me, target)) {
    return createSelfChat(userId);
  }
  const meId = me?.id?.trim() || null;
  if (!meId) {
    throw new Error(
      "Microsoft-Konto ohne Benutzer-Id. Unter Konto Microsoft 365 neu verbinden."
    );
  }
  try {
    return await postCreateChat(userId, [
      memberBinding(meId),
      memberBinding(otherKey),
    ]);
  } catch (error) {
    const existing = await findExistingOneOnOneChat(userId, target);
    if (existing) return existing;
    throw error;
  }
}

export async function getOrCreateOneOnOneChat(
  userId: number,
  target: { microsoftId?: string | null; email?: string | null }
): Promise<{ chatId: string; created: boolean }> {
  let me: MicrosoftMe | null = null;
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
