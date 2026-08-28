import { withTimeout } from "@/lib/dashboard/with-timeout";
import {
  TEAMS_DAY_CHAT_LIMIT,
  TEAMS_DAY_MESSAGES_PER_CHAT,
  chatsActiveOnZurichDay,
  filterMessagesForZurichDay,
  type TeamsThreadForAnalysis,
} from "@/lib/microsoft/analyze-teams-chat";
import {
  formatTeamsChannelTitle,
  listChannelMessages,
  listTeamsChannels,
} from "@/lib/microsoft/teams-channels";
import { listTeamsChatMessages, listTeamsChats } from "@/lib/microsoft/teams-chats";
import { previewText } from "@/lib/microsoft/teams-text";
import { channelThreadKey } from "@/lib/microsoft/teams-thread-state";

export const TEAMS_DAY_CHANNEL_LIMIT = 8;
export const TEAMS_DAY_MESSAGES_PER_CHANNEL = 25;
/** Hard stop for channel crawl — same idea as OOF home sync, not the whole tenant. */
export const TEAMS_DAY_CHANNEL_SCAN_MS = 12_000;

export type TeamsDayCollected = {
  threads: TeamsThreadForAnalysis[];
  chatsConsidered: number;
  chatsAnalyzed: number;
  channelsConsidered: number;
  channelsAnalyzed: number;
  timedOut: boolean;
};

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () =>
      worker()
    )
  );
  return out;
}

export function threadPreviewFromMessages(
  messages: TeamsThreadForAnalysis["messages"]
): string | null {
  const last = [...messages].reverse().find((m) => m.text.trim());
  if (!last) return null;
  return previewText(last.text, 96);
}

export function threadLastActiveAt(
  messages: TeamsThreadForAnalysis["messages"]
): string | null {
  let latest: string | null = null;
  for (const m of messages) {
    if (m.createdAt && (!latest || m.createdAt > latest)) latest = m.createdAt;
  }
  return latest;
}

export async function collectTeamsDayChatThreads(
  userId: number,
  dayYmd: string
): Promise<{
  threads: TeamsThreadForAnalysis[];
  chatsConsidered: number;
}> {
  const listed = await listTeamsChats(userId, { top: 40 });
  const todays = chatsActiveOnZurichDay(listed, dayYmd).slice(
    0,
    TEAMS_DAY_CHAT_LIMIT
  );
  const threads = (
    await mapLimit(todays, 4, async (chat) => {
      try {
        const messages = await listTeamsChatMessages(userId, chat.id, {
          top: TEAMS_DAY_MESSAGES_PER_CHAT,
        });
        const todayMsgs = filterMessagesForZurichDay(messages, dayYmd);
        if (todayMsgs.length === 0) return null;
        return {
          id: chat.id,
          title: chat.title,
          kind: "chat" as const,
          messages: todayMsgs,
          lastActiveAt: chat.lastUpdatedAt || threadLastActiveAt(todayMsgs),
          preview: chat.preview || threadPreviewFromMessages(todayMsgs),
          joinUrl: chat.joinUrl,
          calendarEventId: chat.calendarEventId,
        } satisfies TeamsThreadForAnalysis;
      } catch {
        return null;
      }
    })
  ).filter((t): t is TeamsThreadForAnalysis => t != null);
  return { threads, chatsConsidered: listed.length };
}

export async function collectTeamsDayChannelThreads(
  userId: number,
  dayYmd: string
): Promise<{
  threads: TeamsThreadForAnalysis[];
  channelsConsidered: number;
  timedOut: boolean;
}> {
  const empty = {
    threads: [] as TeamsThreadForAnalysis[],
    channelsConsidered: 0,
    timedOut: false,
  };
  const started = Date.now();
  const result = await withTimeout(
    (async () => {
      const channels = await listTeamsChannels(userId, {
        maxTeams: 16,
        maxChannels: 40,
      });
      const hits: TeamsThreadForAnalysis[] = [];
      let considered = 0;
      for (const channel of channels) {
        if (Date.now() - started > TEAMS_DAY_CHANNEL_SCAN_MS) {
          return {
            threads: hits,
            channelsConsidered: considered,
            timedOut: true,
          };
        }
        if (hits.length >= TEAMS_DAY_CHANNEL_LIMIT) break;
        considered += 1;
        try {
          const messages = await listChannelMessages(
            userId,
            channel.teamId,
            channel.id,
            { top: TEAMS_DAY_MESSAGES_PER_CHANNEL }
          );
          const todayMsgs = filterMessagesForZurichDay(messages, dayYmd);
          if (todayMsgs.length === 0) continue;
          hits.push({
            id: channelThreadKey(channel.teamId, channel.id),
            title: formatTeamsChannelTitle(channel.teamName, channel.name),
            kind: "channel",
            messages: todayMsgs,
            lastActiveAt: threadLastActiveAt(todayMsgs),
            preview: threadPreviewFromMessages(todayMsgs),
          });
        } catch {
          continue;
        }
      }
      return {
        threads: hits,
        channelsConsidered: considered,
        timedOut: false,
      };
    })(),
    TEAMS_DAY_CHANNEL_SCAN_MS,
    { ...empty, timedOut: true }
  );
  return result;
}

export async function collectTeamsDayThreads(
  userId: number,
  dayYmd: string,
  options?: { includeChannels?: boolean }
): Promise<TeamsDayCollected> {
  const chats = await collectTeamsDayChatThreads(userId, dayYmd);
  let channels = {
    threads: [] as TeamsThreadForAnalysis[],
    channelsConsidered: 0,
    timedOut: false,
  };
  if (options?.includeChannels !== false) {
    channels = await collectTeamsDayChannelThreads(userId, dayYmd);
  }
  return {
    threads: [...chats.threads, ...channels.threads],
    chatsConsidered: chats.chatsConsidered,
    chatsAnalyzed: chats.threads.length,
    channelsConsidered: channels.channelsConsidered,
    channelsAnalyzed: channels.threads.length,
    timedOut: channels.timedOut,
  };
}
