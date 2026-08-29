import { graphJson, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { parseChannelThreadKey } from "@/lib/microsoft/teams-thread-state";

export type TeamsReplyTarget =
  | { kind: "chat"; chatId: string }
  | { kind: "channel"; teamId: string; channelId: string };

export function parseTeamsReplyTarget(input: {
  chatId?: string | null;
  teamId?: string | null;
  channelId?: string | null;
  threadKey?: string | null;
}): TeamsReplyTarget | null {
  const teamId = input.teamId?.trim() || "";
  const channelId = input.channelId?.trim() || "";
  if (teamId || channelId) {
    if (!teamId || !channelId) return null;
    return { kind: "channel", teamId, channelId };
  }
  const chatId = input.chatId?.trim() || "";
  if (chatId) return { kind: "chat", chatId };
  const threadKey = input.threadKey?.trim() || "";
  if (!threadKey) return null;
  const channel = parseChannelThreadKey(threadKey);
  if (channel) return { kind: "channel", ...channel };
  return { kind: "chat", chatId: threadKey };
}

function graphMessageBody(
  text: string,
  contentType: "text" | "html" = "text"
) {
  return JSON.stringify({
    body: { contentType, content: text },
  });
}

export async function sendTeamsChatMessage(
  userId: number,
  chatId: string,
  body: string,
  options?: { contentType?: "text" | "html" }
): Promise<{ id: string }> {
  const id = chatId.trim();
  const text = body.trim();
  if (!id || !text) throw new Error("Chat und Text nötig.");
  try {
    const created = await graphJson<{ id?: string }>(
      userId,
      `/me/chats/${encodeURIComponent(id)}/messages`,
      {
        method: "POST",
        body: graphMessageBody(text, options?.contentType ?? "text"),
      }
    );
    if (!created.id) {
      throw new Error("Teams hat keine Nachrichten-Id zurückgegeben.");
    }
    return { id: created.id };
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      throw new Error(
        "ChatMessage.Send fehlt. Unter Konto Microsoft 365 neu verbinden."
      );
    }
    throw error;
  }
}

export async function sendTeamsChannelMessage(
  userId: number,
  teamId: string,
  channelId: string,
  body: string
): Promise<{ id: string }> {
  const tid = teamId.trim();
  const cid = channelId.trim();
  const text = body.trim();
  if (!tid || !cid || !text) throw new Error("Kanal und Text nötig.");
  try {
    const created = await graphJson<{ id?: string }>(
      userId,
      `/teams/${encodeURIComponent(tid)}/channels/${encodeURIComponent(cid)}/messages`,
      { method: "POST", body: graphMessageBody(text) }
    );
    if (!created.id) {
      throw new Error("Teams hat keine Nachrichten-Id zurückgegeben.");
    }
    return { id: created.id };
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      throw new Error(
        "Graph hat das Senden in den Kanal abgelehnt. Text kopieren und in Teams einfügen."
      );
    }
    throw error;
  }
}
