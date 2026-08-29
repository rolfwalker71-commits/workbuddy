import { getTicketDetail } from "@/lib/mari/tickets";
import {
  formatTicketPingHtml,
  ticketPingFields,
  ticketPingLink,
} from "@/lib/mari/ticket-ping-format";
import {
  hasMicrosoftChatCreateScope,
  hasMicrosoftChatMessageSendScope,
  isMicrosoftConnected,
  readMicrosoftUserTokens,
} from "@/lib/microsoft/oauth";
import {
  findExistingOneOnOneChat,
  getOrCreateOneOnOneChat,
} from "@/lib/microsoft/teams-chats";
import { sendTeamsChatMessage } from "@/lib/microsoft/teams-send";
import { getAppUserById } from "@/lib/users/queries";

export {
  escapeTicketPingHtml,
  formatTicketPingHtml,
  ticketPingFields,
  ticketPingLink,
  type TicketPingFields,
} from "@/lib/mari/ticket-ping-format";

export type TicketPingResult = {
  chatId: string;
  messageId: string;
  created: boolean;
};

export async function pingColleagueAboutTicket(input: {
  actorUserId: number;
  issueId: number;
  colleagueUserId?: number | null;
  microsoftId?: string | null;
  email?: string | null;
  existingChatId?: string | null;
  request?: Request | null;
}): Promise<TicketPingResult> {
  const actorUserId = input.actorUserId;
  if (!isMicrosoftConnected(actorUserId)) {
    throw new Error("Microsoft 365 nicht verbunden.");
  }
  if (!hasMicrosoftChatMessageSendScope(actorUserId)) {
    throw new Error(
      "ChatMessage.Send fehlt. Unter Konto Microsoft 365 neu verbinden."
    );
  }

  let microsoftId = input.microsoftId?.trim() || null;
  let email = input.email?.trim() || null;
  let existingChatId = input.existingChatId?.trim() || null;

  if (input.colleagueUserId != null) {
    const colleague = getAppUserById(input.colleagueUserId);
    if (!colleague || !colleague.active) {
      throw new Error("Kollege nicht gefunden.");
    }
    if (colleague.id === actorUserId) {
      throw new Error("Du kannst dich nicht selbst informieren.");
    }
    const tokens = readMicrosoftUserTokens(colleague.id);
    microsoftId = tokens?.microsoftId?.trim() || microsoftId;
    email = tokens?.email?.trim() || colleague.email?.trim() || email;
  }

  if (!microsoftId && !email && !existingChatId) {
    throw new Error(
      "Kollege hat keine Microsoft-Id. Nur Personen, die Microsoft verbunden haben."
    );
  }

  const ticket = await getTicketDetail(input.issueId);
  const fields = ticketPingFields(ticket);
  const link = ticketPingLink(ticket.issueId, input.request);
  const html = formatTicketPingHtml(fields, link);

  let chatId = existingChatId;
  let created = false;
  if (!chatId) {
    const existing = await findExistingOneOnOneChat(actorUserId, {
      microsoftId,
      email,
    });
    if (existing) {
      chatId = existing;
    } else if (!hasMicrosoftChatCreateScope(actorUserId)) {
      throw new Error(
        "Chat.Create fehlt. Unter Konto Microsoft 365 neu verbinden."
      );
    } else {
      const chat = await getOrCreateOneOnOneChat(actorUserId, {
        microsoftId,
        email,
      });
      chatId = chat.chatId;
      created = chat.created;
    }
  }

  if (!chatId) {
    throw new Error("Kein Teams-Chat für diesen Kollegen.");
  }
  const sent = await sendTeamsChatMessage(actorUserId, chatId, html, {
    contentType: "html",
  });
  return { chatId, messageId: sent.id, created };
}
