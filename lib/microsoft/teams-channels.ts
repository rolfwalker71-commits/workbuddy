import { graphJson, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { graphODataQuery, graphPath } from "@/lib/microsoft/graph-query";
import type { TeamsChatMessage } from "@/lib/microsoft/teams-chats";
import { stripGraphHtml } from "@/lib/microsoft/teams-text";

export type TeamsChannelMembership = "standard" | "private" | "shared" | "unknown";

export type TeamsJoinedTeam = {
  id: string;
  name: string;
  description: string | null;
};

export type TeamsChannelItem = {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  description: string | null;
  webUrl: string | null;
  membershipType: TeamsChannelMembership;
};

export type TeamsWithChannels = TeamsJoinedTeam & {
  channels: TeamsChannelItem[];
};

type GraphTeam = {
  id?: string;
  displayName?: string | null;
  description?: string | null;
};

type GraphChannel = {
  id?: string;
  displayName?: string | null;
  description?: string | null;
  webUrl?: string | null;
  membershipType?: string | null;
};

type GraphChannelMessage = {
  id?: string;
  createdDateTime?: string | null;
  deletedDateTime?: string | null;
  messageType?: string | null;
  from?: { user?: { displayName?: string | null } | null } | null;
  body?: { content?: string | null; contentType?: string | null } | null;
};

export function asChannelMembership(
  raw: string | null | undefined
): TeamsChannelMembership {
  if (raw === "standard" || raw === "private" || raw === "shared") return raw;
  return "unknown";
}

export function mapGraphTeam(raw: GraphTeam): TeamsJoinedTeam | null {
  const id = raw.id?.trim();
  const name = raw.displayName?.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: raw.description?.trim() || null,
  };
}

export function mapGraphChannel(
  raw: GraphChannel,
  team: Pick<TeamsJoinedTeam, "id" | "name">
): TeamsChannelItem | null {
  const id = raw.id?.trim();
  const name = raw.displayName?.trim();
  if (!id || !name) return null;
  return {
    id,
    teamId: team.id,
    teamName: team.name,
    name,
    description: raw.description?.trim() || null,
    webUrl: raw.webUrl || null,
    membershipType: asChannelMembership(raw.membershipType),
  };
}

export function mapGraphChannelMessage(
  raw: GraphChannelMessage
): TeamsChatMessage | null {
  if (!raw.id || raw.deletedDateTime) return null;
  if (raw.messageType && raw.messageType !== "message") return null;
  const text = stripGraphHtml(raw.body?.content);
  if (!text) return null;
  return {
    id: raw.id,
    createdAt: raw.createdDateTime || null,
    from: raw.from?.user?.displayName?.trim() || null,
    text,
  };
}

export async function listJoinedTeams(
  userId: number,
  options?: { top?: number }
): Promise<TeamsJoinedTeam[]> {
  // GET /me/joinedTeams rejects all OData options, including $top (Graph 400).
  const data = await graphJson<{ value?: GraphTeam[] }>(
    userId,
    graphPath("/me/joinedTeams")
  );
  const items: TeamsJoinedTeam[] = [];
  for (const raw of data.value || []) {
    const team = mapGraphTeam(raw);
    if (team) items.push(team);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "de"));
  if (options?.top == null) return items;
  const limit = Math.min(Math.max(options.top, 1), items.length);
  return items.slice(0, limit);
}

export async function listTeamChannels(
  userId: number,
  team: Pick<TeamsJoinedTeam, "id" | "name">,
  options?: { top?: number }
): Promise<TeamsChannelItem[]> {
  // List channels supports $select/$filter only — $top returns Graph 400.
  const qs = graphODataQuery({
    select: "id,displayName,description,webUrl,membershipType",
  });
  const data = await graphJson<{ value?: GraphChannel[] }>(
    userId,
    graphPath(`/teams/${encodeURIComponent(team.id)}/channels`, qs)
  );
  const items: TeamsChannelItem[] = [];
  for (const raw of data.value || []) {
    const channel = mapGraphChannel(raw, team);
    if (channel) items.push(channel);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "de"));
  if (options?.top == null) return items;
  const limit = Math.min(Math.max(options.top, 1), items.length);
  return items.slice(0, limit);
}

export async function listJoinedTeamsWithChannels(
  userId: number
): Promise<TeamsWithChannels[]> {
  const teams = await listJoinedTeams(userId);
  const withChannels = await Promise.all(
    teams.map(async (team) => {
      try {
        const channels = await listTeamChannels(userId, team);
        return { ...team, channels };
      } catch (error) {
        if (
          error instanceof MicrosoftGraphError &&
          (error.status === 403 || error.status === 404)
        ) {
          return { ...team, channels: [] };
        }
        throw error;
      }
    })
  );
  return withChannels;
}

export async function listChannelMessages(
  userId: number,
  teamId: string,
  channelId: string,
  options?: { top?: number }
): Promise<TeamsChatMessage[]> {
  const tid = teamId.trim();
  const cid = channelId.trim();
  if (!tid || !cid) return [];
  const top = Math.min(Math.max(options?.top ?? 40, 1), 80);
  const qs = new URLSearchParams({ $top: String(top) });
  const data = await graphJson<{ value?: GraphChannelMessage[] }>(
    userId,
    `/teams/${encodeURIComponent(tid)}/channels/${encodeURIComponent(cid)}/messages?${qs}`
  );
  const out: TeamsChatMessage[] = [];
  for (const raw of data.value || []) {
    const msg = mapGraphChannelMessage(raw);
    if (msg) out.push(msg);
  }
  out.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return out;
}
