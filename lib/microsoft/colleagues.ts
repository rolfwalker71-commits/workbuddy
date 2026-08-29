import { withTimeout } from "@/lib/dashboard/with-timeout";
import {
  isMicrosoftConnected,
  readMicrosoftUserTokens,
} from "@/lib/microsoft/oauth";
import {
  listOneOnOneChatPeers,
  type TeamsChatPeer,
} from "@/lib/microsoft/teams-chats";
import { getAppUserById, listAppUsers } from "@/lib/users/queries";

export type TicketPingColleague = {
  key: string;
  source: "workbuddy" | "chat" | "self";
  userId: number | null;
  displayName: string;
  email: string | null;
  microsoftId: string | null;
  chatId: string | null;
};

/** Chat-peer enrichment only — never block the picker on a full /me/chats crawl. */
export const TICKET_PING_PEER_MAX_PAGES = 2;
export const TICKET_PING_PEER_TIMEOUT_MS = 8000;
export const TICKET_PING_LIST_TIMEOUT_MS = 12000;

function normEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

export function colleagueKey(input: {
  userId?: number | null;
  microsoftId?: string | null;
  email?: string | null;
}): string {
  if (input.userId != null) return `u:${input.userId}`;
  const id = input.microsoftId?.trim();
  if (id) return `aad:${id.toLowerCase()}`;
  const email = normEmail(input.email);
  if (email) return `mail:${email}`;
  return "";
}

function peerAsColleague(peer: TeamsChatPeer): TicketPingColleague | null {
  const key = colleagueKey({
    microsoftId: peer.microsoftId,
    email: peer.email,
  });
  if (!key) return null;
  return {
    key,
    source: "chat",
    userId: null,
    displayName: peer.displayName?.trim() || peer.email || "Kollege",
    email: peer.email,
    microsoftId: peer.microsoftId,
    chatId: peer.chatId,
  };
}

/** Merge Ich + WorkBuddy roster + optional 1:1 peers. Local rows always win. */
export function mergeTicketPingColleagues(
  self: TicketPingColleague | null,
  workbuddy: TicketPingColleague[],
  peers: TicketPingColleague[] = []
): TicketPingColleague[] {
  const seen = new Set<string>();
  const out: TicketPingColleague[] = [];

  function remember(row: TicketPingColleague) {
    const mailKey = colleagueKey({
      microsoftId: row.microsoftId,
      email: row.email,
    });
    if (mailKey) seen.add(mailKey);
    if (row.userId != null) seen.add(`u:${row.userId}`);
    if (row.key) seen.add(row.key);
  }

  if (self) {
    remember(self);
    out.push(self);
  }
  for (const row of workbuddy) {
    remember(row);
    out.push(row);
  }
  for (const row of peers) {
    if (!row.key || seen.has(row.key)) continue;
    const mailKey = colleagueKey({
      microsoftId: row.microsoftId,
      email: row.email,
    });
    if (mailKey && seen.has(mailKey)) continue;
    if (
      row.microsoftId &&
      workbuddy.some(
        (w) =>
          w.microsoftId &&
          w.microsoftId.toLowerCase() === row.microsoftId!.toLowerCase()
      )
    ) {
      continue;
    }
    if (
      row.email &&
      workbuddy.some((w) => normEmail(w.email) === normEmail(row.email))
    ) {
      continue;
    }
    remember(row);
    out.push(row);
  }
  return out;
}

/** WorkBuddy users who connected Microsoft — stored oid/email only, no Graph. */
export function listWorkbuddyMicrosoftColleagues(
  actorUserId: number
): TicketPingColleague[] {
  const out: TicketPingColleague[] = [];
  for (const user of listAppUsers()) {
    if (!user.active || user.id === actorUserId) continue;
    if (!isMicrosoftConnected(user.id)) continue;
    const tokens = readMicrosoftUserTokens(user.id);
    const microsoftId = tokens?.microsoftId?.trim() || null;
    const email = tokens?.email?.trim() || user.email?.trim() || null;
    if (!microsoftId && !email) continue;
    out.push({
      key: colleagueKey({ userId: user.id, microsoftId, email }),
      source: "workbuddy",
      userId: user.id,
      displayName:
        user.display_name?.trim() ||
        tokens?.displayName?.trim() ||
        email ||
        user.username,
      email,
      microsoftId,
      chatId: null,
    });
  }
  out.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "de", { sensitivity: "base" })
  );
  return out;
}

export function selfAsTestColleague(
  actorUserId: number
): TicketPingColleague | null {
  const user = getAppUserById(actorUserId);
  if (!user || !user.active) return null;
  if (!isMicrosoftConnected(actorUserId)) return null;
  const tokens = readMicrosoftUserTokens(actorUserId);
  const microsoftId = tokens?.microsoftId?.trim() || null;
  const email = tokens?.email?.trim() || user.email?.trim() || null;
  if (!microsoftId && !email) return null;
  return {
    key: colleagueKey({ userId: user.id, microsoftId, email }),
    source: "self",
    userId: user.id,
    displayName: "Ich (Test)",
    email,
    microsoftId,
    chatId: null,
  };
}

export function listLocalTicketPingColleagues(
  actorUserId: number
): TicketPingColleague[] {
  return mergeTicketPingColleagues(
    selfAsTestColleague(actorUserId),
    listWorkbuddyMicrosoftColleagues(actorUserId)
  );
}

async function enrichWithChatPeers(
  actorUserId: number,
  local: TicketPingColleague[]
): Promise<TicketPingColleague[]> {
  const self = local.find((row) => row.source === "self") ?? null;
  const workbuddy = local.filter((row) => row.source === "workbuddy");
  try {
    const peers = await withTimeout(
      listOneOnOneChatPeers(actorUserId, {
        maxPages: TICKET_PING_PEER_MAX_PAGES,
        deadlineMs: TICKET_PING_PEER_TIMEOUT_MS,
      }),
      TICKET_PING_PEER_TIMEOUT_MS,
      []
    );
    return mergeTicketPingColleagues(
      self,
      workbuddy,
      peers.map(peerAsColleague).filter((row): row is TicketPingColleague => row != null)
    );
  } catch {
    return local;
  }
}

export async function listTicketPingColleagues(
  actorUserId: number,
  options?: { enrich?: boolean }
): Promise<TicketPingColleague[]> {
  const local = listLocalTicketPingColleagues(actorUserId);
  if (!options?.enrich) return local;
  return enrichWithChatPeers(actorUserId, local);
}
