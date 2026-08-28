import type { TeamsChatAnalysis } from "@/lib/microsoft/analyze-teams-chat";
import { zurichYmdFromIso } from "@/lib/mail/mail-threads";

export const TEAMS_INBOX_FILTERS = ["today", "open", "done"] as const;
export type TeamsInboxFilter = (typeof TEAMS_INBOX_FILTERS)[number];

export type TeamsInboxStatus = "open" | "later" | "done" | "ignored";
export type TeamsInboxKind = "chat" | "channel";
export type TeamsInboxChatType = "oneOnOne" | "group" | "meeting" | "unknown";

export type TeamsInboxThreadRow = {
  threadKey: string;
  kind: TeamsInboxKind;
  inbox: TeamsInboxStatus;
  title: string | null;
  preview: string | null;
  lastActiveAt: string | null;
  joinUrl: string | null;
  calendarEventId: string | null;
  issueId: number | null;
  appliedTasks: number;
  appliedEvents: number;
  lastAnalysis: TeamsChatAnalysis | null;
};

export type TeamsInboxChatSource = {
  id: string;
  title: string;
  chatType: TeamsInboxChatType;
  lastUpdatedAt: string | null;
  preview: string | null;
  webUrl: string | null;
  joinUrl: string | null;
  calendarEventId?: string | null;
};

export type TeamsInboxChannelSource = {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  description: string | null;
  webUrl: string | null;
};

export type TeamsInboxCard = {
  threadKey: string;
  kind: TeamsInboxKind;
  title: string;
  typeLabel: string;
  lastActiveAt: string | null;
  preview: string | null;
  webUrl: string | null;
  joinUrl: string | null;
  calendarEventId: string | null;
  chatType: TeamsInboxChatType | null;
  teamId: string | null;
  channelId: string | null;
  inbox: TeamsInboxStatus;
  issueId: number | null;
  appliedTasks: number;
  appliedEvents: number;
  lastAnalysis: TeamsChatAnalysis | null;
  analyzed: boolean;
  taskCount: number;
  eventCount: number;
};

export function channelInboxKey(teamId: string, channelId: string): string {
  return `${teamId.trim()}:${channelId.trim()}`;
}

export function parseChannelInboxKey(
  raw: string | null | undefined
): { teamId: string; channelId: string } | null {
  const key = raw?.trim() || "";
  const idx = key.indexOf(":");
  if (idx < 1) return null;
  const teamId = key.slice(0, idx).trim();
  const channelId = key.slice(idx + 1).trim();
  if (!teamId || !channelId) return null;
  if (teamId === "19") return null;
  return { teamId, channelId };
}

export function isTeamsInboxActiveToday(
  lastActiveAt: string | null | undefined,
  todayYmd: string
): boolean {
  return zurichYmdFromIso(lastActiveAt) === todayYmd;
}

/** Day results stamp the matching cluster onto one card — never a loose list block. */
export function scopeTeamsAnalysisToThread(
  analysis: TeamsChatAnalysis,
  threadKey: string
): TeamsChatAnalysis {
  const key = threadKey.trim();
  const cluster = analysis.clusters.find((c) => c.sourceChatId === key);
  if (cluster) {
    return {
      summary: cluster.summary || analysis.summary,
      clusters: [cluster],
      tasks: cluster.tasks,
      events: cluster.events,
      replies: cluster.replies,
    };
  }
  return {
    summary: analysis.summary,
    clusters: [],
    tasks: analysis.tasks.filter((t) => t.sourceChatId === key),
    events: analysis.events.filter((e) => e.sourceChatId === key),
    replies: analysis.replies.filter((r) => r.sourceChatId === key),
  };
}

function hasScopedWork(analysis: TeamsChatAnalysis | null): boolean {
  if (!analysis) return false;
  return (
    analysis.clusters.length > 0 ||
    analysis.tasks.length > 0 ||
    analysis.events.length > 0 ||
    analysis.replies.length > 0
  );
}

export function inboxTypeLabel(
  kind: TeamsInboxKind,
  chatType?: TeamsInboxChatType | null
): string {
  if (kind === "channel") return "Kanal";
  if (chatType === "meeting") return "Meeting";
  if (chatType === "group") return "Gruppe";
  if (chatType === "oneOnOne") return "Chat";
  return "Chat";
}

export function inboxStatusLabel(inbox: TeamsInboxStatus): string {
  if (inbox === "later") return "Später";
  if (inbox === "done") return "Erledigt";
  if (inbox === "ignored") return "Ignoriert";
  return "Offen";
}

/**
 * Filter rules:
 * - ignored never appears
 * - Heute = active today (Graph last activity, stamped lastActiveAt, or day threadKeys)
 *   and not ignored. Done stays done — it still lists here so the user can reopen.
 * - Offen = open + later (backlog, any day)
 * - Erledigt = done only
 */
export function matchesTeamsInboxFilter(
  card: Pick<TeamsInboxCard, "inbox" | "lastActiveAt"> & {
    inDayScope?: boolean;
  },
  filter: TeamsInboxFilter,
  todayYmd: string
): boolean {
  if (card.inbox === "ignored") return false;
  if (filter === "today") {
    return (
      card.inDayScope === true ||
      isTeamsInboxActiveToday(card.lastActiveAt, todayYmd)
    );
  }
  if (filter === "open") {
    return card.inbox === "open" || card.inbox === "later";
  }
  return card.inbox === "done";
}

function emptyState(
  threadKey: string,
  kind: TeamsInboxKind
): TeamsInboxThreadRow {
  return {
    threadKey,
    kind,
    inbox: "open",
    title: null,
    preview: null,
    lastActiveAt: null,
    joinUrl: null,
    calendarEventId: null,
    issueId: null,
    appliedTasks: 0,
    appliedEvents: 0,
    lastAnalysis: null,
  };
}

function stampCard(
  base: Omit<
    TeamsInboxCard,
    | "lastAnalysis"
    | "analyzed"
    | "taskCount"
    | "eventCount"
    | "inbox"
    | "issueId"
    | "appliedTasks"
    | "appliedEvents"
  > & {
    inbox: TeamsInboxStatus;
    state: TeamsInboxThreadRow;
    dayAnalysis: TeamsChatAnalysis | null;
    dayThreadKeys: Set<string>;
  }
): TeamsInboxCard {
  const scoped = base.dayAnalysis
    ? scopeTeamsAnalysisToThread(base.dayAnalysis, base.threadKey)
    : null;
  const lastAnalysis =
    base.state.lastAnalysis ||
    (base.dayThreadKeys.has(base.threadKey) && hasScopedWork(scoped)
      ? scoped
      : null);
  const taskCount =
    base.state.appliedTasks > 0
      ? base.state.appliedTasks
      : lastAnalysis?.tasks.length || 0;
  const eventCount =
    base.state.appliedEvents > 0
      ? base.state.appliedEvents
      : lastAnalysis?.events.length || 0;
  return {
    threadKey: base.threadKey,
    kind: base.kind,
    title: base.title,
    typeLabel: base.typeLabel,
    lastActiveAt: base.lastActiveAt,
    preview: base.preview,
    webUrl: base.webUrl,
    joinUrl: base.joinUrl,
    calendarEventId: base.calendarEventId,
    chatType: base.chatType,
    teamId: base.teamId,
    channelId: base.channelId,
    inbox: base.inbox,
    issueId: base.state.issueId,
    appliedTasks: base.state.appliedTasks,
    appliedEvents: base.state.appliedEvents,
    lastAnalysis,
    analyzed: Boolean(lastAnalysis) || base.dayThreadKeys.has(base.threadKey),
    taskCount,
    eventCount,
  };
}

export function buildTeamsInboxCards(input: {
  chats: TeamsInboxChatSource[];
  channels: TeamsInboxChannelSource[];
  threads: TeamsInboxThreadRow[];
  dayAnalysis?: TeamsChatAnalysis | null;
  dayThreadKeys?: string[];
  todayYmd: string;
  filter: TeamsInboxFilter;
}): TeamsInboxCard[] {
  const dayKeys = new Set(
    (input.dayThreadKeys || []).map((k) => k.trim()).filter(Boolean)
  );
  const dayAnalysis = input.dayAnalysis ?? null;
  const byKey = new Map(
    input.threads.map((t) => [t.threadKey, t] as const)
  );
  const seen = new Set<string>();
  const cards: TeamsInboxCard[] = [];

  const pushIfMatch = (
    card: TeamsInboxCard,
    inDayScope: boolean
  ) => {
    if (
      matchesTeamsInboxFilter(
        { ...card, inDayScope },
        input.filter,
        input.todayYmd
      )
    ) {
      cards.push(card);
    }
  };

  for (const chat of input.chats) {
    const threadKey = chat.id.trim();
    if (!threadKey) continue;
    seen.add(threadKey);
    const state = byKey.get(threadKey) ?? emptyState(threadKey, "chat");
    const lastActiveAt = chat.lastUpdatedAt || state.lastActiveAt;
    const inDayScope = dayKeys.has(threadKey);
    const card = stampCard({
      threadKey,
      kind: "chat",
      title: chat.title || state.title || "Chat",
      typeLabel: inboxTypeLabel("chat", chat.chatType),
      lastActiveAt,
      preview: chat.preview || state.preview,
      webUrl: chat.webUrl,
      joinUrl: chat.joinUrl || state.joinUrl,
      calendarEventId: chat.calendarEventId ?? state.calendarEventId,
      chatType: chat.chatType,
      teamId: null,
      channelId: null,
      inbox: state.inbox,
      state,
      dayAnalysis,
      dayThreadKeys: dayKeys,
    });
    pushIfMatch(card, inDayScope);
  }

  for (const channel of input.channels) {
    const threadKey = channelInboxKey(channel.teamId, channel.id);
    if (!threadKey || seen.has(threadKey)) continue;
    const state = byKey.get(threadKey);
    const inDayScope = dayKeys.has(threadKey);
    const lastActiveAt = state?.lastActiveAt ?? null;
    const known =
      Boolean(state) ||
      inDayScope ||
      isTeamsInboxActiveToday(lastActiveAt, input.todayYmd);
    if (!known) continue;
    seen.add(threadKey);
    const row = state ?? emptyState(threadKey, "channel");
    const title =
      row.title ||
      [channel.teamName, channel.name].filter(Boolean).join(" · ") ||
      "Kanal";
    const card = stampCard({
      threadKey,
      kind: "channel",
      title,
      typeLabel: inboxTypeLabel("channel"),
      lastActiveAt,
      preview: row.preview || channel.description,
      webUrl: channel.webUrl,
      joinUrl: row.joinUrl,
      calendarEventId: row.calendarEventId,
      chatType: null,
      teamId: channel.teamId,
      channelId: channel.id,
      inbox: row.inbox,
      state: row,
      dayAnalysis,
      dayThreadKeys: dayKeys,
    });
    pushIfMatch(card, inDayScope);
  }

  for (const state of input.threads) {
    if (seen.has(state.threadKey)) continue;
    seen.add(state.threadKey);
    const parsed = parseChannelInboxKey(state.threadKey);
    const kind = state.kind;
    const inDayScope = dayKeys.has(state.threadKey);
    const card = stampCard({
      threadKey: state.threadKey,
      kind,
      title: state.title || (kind === "channel" ? "Kanal" : "Chat"),
      typeLabel: inboxTypeLabel(kind),
      lastActiveAt: state.lastActiveAt,
      preview: state.preview,
      webUrl: null,
      joinUrl: state.joinUrl,
      calendarEventId: state.calendarEventId,
      chatType: null,
      teamId: parsed?.teamId ?? null,
      channelId: parsed?.channelId ?? null,
      inbox: state.inbox,
      state,
      dayAnalysis,
      dayThreadKeys: dayKeys,
    });
    pushIfMatch(card, inDayScope);
  }

  cards.sort((a, b) => {
    const at = a.lastActiveAt || "";
    const bt = b.lastActiveAt || "";
    if (at !== bt) return bt.localeCompare(at);
    return a.title.localeCompare(b.title, "de");
  });
  return cards;
}

export function inboxCardCanApply(card: TeamsInboxCard): boolean {
  const analysis = card.lastAnalysis;
  if (!analysis) return false;
  return analysis.tasks.length + analysis.events.length > 0;
}
