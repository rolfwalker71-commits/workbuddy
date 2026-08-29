import {
  isMicrosoftConnected,
  readMicrosoftUserTokens,
  saveMicrosoftUserTokens,
} from "@/lib/microsoft/oauth";
import { getMicrosoftMe } from "@/lib/microsoft/graph";
import { listOneOnOneChatPeers } from "@/lib/microsoft/teams-chats";
import { listAppUsers } from "@/lib/users/queries";

export type TicketPingColleague = {
  key: string;
  source: "workbuddy" | "chat";
  userId: number | null;
  displayName: string;
  email: string | null;
  microsoftId: string | null;
  chatId: string | null;
};

function normEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

function colleagueKey(input: {
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

async function backfillMicrosoftId(userId: number): Promise<string | null> {
  const stored = readMicrosoftUserTokens(userId);
  if (!stored?.refreshToken) return null;
  if (stored.microsoftId?.trim()) return stored.microsoftId.trim();
  try {
    const me = await getMicrosoftMe(userId);
    const id = me.id?.trim() || null;
    if (id) {
      saveMicrosoftUserTokens(userId, { ...stored, microsoftId: id });
    }
    return id;
  } catch {
    return stored.microsoftId?.trim() || null;
  }
}

/** WorkBuddy users who connected Microsoft — oid and/or email, no User.Read.All. */
export async function listWorkbuddyMicrosoftColleagues(
  actorUserId: number
): Promise<TicketPingColleague[]> {
  const out: TicketPingColleague[] = [];
  for (const user of listAppUsers()) {
    if (!user.active || user.id === actorUserId) continue;
    if (!isMicrosoftConnected(user.id)) continue;
    const tokens = readMicrosoftUserTokens(user.id);
    const microsoftId =
      tokens?.microsoftId?.trim() ||
      (await backfillMicrosoftId(user.id));
    const email =
      tokens?.email?.trim() || user.email?.trim() || null;
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

export async function listTicketPingColleagues(
  actorUserId: number
): Promise<TicketPingColleague[]> {
  const workbuddy = await listWorkbuddyMicrosoftColleagues(actorUserId);
  const seen = new Set<string>();
  const out: TicketPingColleague[] = [];
  for (const row of workbuddy) {
    seen.add(colleagueKey({ microsoftId: row.microsoftId, email: row.email }));
    if (row.userId != null) seen.add(`u:${row.userId}`);
    out.push(row);
  }

  try {
    const peers = await listOneOnOneChatPeers(actorUserId);
    for (const peer of peers) {
      const key = colleagueKey({
        microsoftId: peer.microsoftId,
        email: peer.email,
      });
      if (!key || seen.has(key)) continue;
      if (
        peer.microsoftId &&
        workbuddy.some(
          (w) =>
            w.microsoftId &&
            w.microsoftId.toLowerCase() === peer.microsoftId!.toLowerCase()
        )
      ) {
        continue;
      }
      if (
        peer.email &&
        workbuddy.some((w) => normEmail(w.email) === normEmail(peer.email))
      ) {
        continue;
      }
      seen.add(key);
      out.push({
        key,
        source: "chat",
        userId: null,
        displayName: peer.displayName?.trim() || peer.email || "Kollege",
        email: peer.email,
        microsoftId: peer.microsoftId,
        chatId: peer.chatId,
      });
    }
  } catch {
    /* Chat.Read optional — WorkBuddy roster is enough */
  }

  return out;
}
