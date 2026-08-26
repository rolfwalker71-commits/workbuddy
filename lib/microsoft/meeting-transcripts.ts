import { graphFetch, graphJson, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { getPrimaryMariCalendarStampForIssue } from "@/lib/mari/calendar-stamp";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  findMeetingChatByJoinUrl,
  getTeamsChat,
  listTeamsChatMessages,
  type TeamsChatMessage,
} from "@/lib/microsoft/teams-chats";
import { escapeODataString, parseWebVttTranscript } from "@/lib/microsoft/teams-text";

export type MeetingTranscriptStatus =
  | "ok"
  | "empty"
  | "not_found"
  | "no_meeting"
  | "forbidden"
  | "processing";

export type MeetingTranscriptResult = {
  status: MeetingTranscriptStatus;
  subject: string | null;
  joinUrl: string | null;
  eventId: string | null;
  issueId: number | null;
  text: string | null;
  createdAt: string | null;
  /** Meeting chat when no official transcript exists. */
  chatId: string | null;
  chatMessages: TeamsChatMessage[];
  hint: string;
};

type GraphOnlineMeeting = {
  id?: string;
  subject?: string | null;
  joinWebUrl?: string | null;
};

type GraphTranscript = {
  id?: string;
  createdDateTime?: string | null;
};

type GraphEventLite = {
  id?: string;
  subject?: string | null;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string | null } | null;
  onlineMeetingUrl?: string | null;
};

const EMPTY_HINT =
  "Kein Transkript. Teams speichert eines nur, wenn die Transkription im Meeting eingeschaltet war und die Verarbeitung fertig ist.";

function result(partial: Partial<MeetingTranscriptResult>): MeetingTranscriptResult {
  return {
    status: partial.status || "empty",
    subject: partial.subject ?? null,
    joinUrl: partial.joinUrl ?? null,
    eventId: partial.eventId ?? null,
    issueId: partial.issueId ?? null,
    text: partial.text ?? null,
    createdAt: partial.createdAt ?? null,
    chatId: partial.chatId ?? null,
    chatMessages: partial.chatMessages ?? [],
    hint: partial.hint ?? EMPTY_HINT,
  };
}

export async function getOutlookEventMeetingInfo(
  userId: number,
  eventId: string,
  calendarId?: string | null
): Promise<{ subject: string | null; joinUrl: string | null } | null> {
  const id = eventId.trim();
  if (!id) return null;
  const path = calendarId?.trim()
    ? `/me/calendars/${encodeURIComponent(calendarId.trim())}/events/${encodeURIComponent(id)}`
    : `/me/events/${encodeURIComponent(id)}`;
  try {
    const ev = await graphJson<GraphEventLite>(
      userId,
      `${path}?$select=id,subject,isOnlineMeeting,onlineMeeting,onlineMeetingUrl`
    );
    const joinUrl =
      ev.onlineMeeting?.joinUrl?.trim() || ev.onlineMeetingUrl?.trim() || null;
    return { subject: ev.subject?.trim() || null, joinUrl };
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function lookupOnlineMeeting(
  userId: number,
  filter: string
): Promise<GraphOnlineMeeting | null> {
  const encoded = encodeURIComponent(filter);
  try {
    const data = await graphJson<{ value?: GraphOnlineMeeting[] }>(
      userId,
      `/me/onlineMeetings?$filter=${encoded}&$select=id,subject,joinWebUrl`
    );
    return data.value?.find((m) => m.id) || null;
  } catch (error) {
    if (
      error instanceof MicrosoftGraphError &&
      (error.status === 400 || error.status === 403 || error.status === 404)
    ) {
      return null;
    }
    throw error;
  }
}

async function lookupOnlineMeetingId(
  userId: number,
  joinUrl: string,
  chatId?: string | null
): Promise<GraphOnlineMeeting | null> {
  const byJoin = await lookupOnlineMeeting(
    userId,
    `JoinWebUrl eq '${escapeODataString(joinUrl)}'`
  );
  if (byJoin) return byJoin;
  const threadId = chatId?.trim();
  if (!threadId) return null;
  return lookupOnlineMeeting(
    userId,
    `ChatInfo/ThreadId eq '${escapeODataString(threadId)}'`
  );
}

async function fetchTranscriptContent(
  userId: number,
  meetingId: string
): Promise<{ text: string | null; createdAt: string | null; status: MeetingTranscriptStatus }> {
  let listed: { value?: GraphTranscript[] };
  try {
    listed = await graphJson<{ value?: GraphTranscript[] }>(
      userId,
      `/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`
    );
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 404) {
      return { text: null, createdAt: null, status: "not_found" };
    }
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      return { text: null, createdAt: null, status: "forbidden" };
    }
    throw error;
  }
  const latest = (listed.value || [])
    .filter((t) => t.id)
    .sort((a, b) =>
      (b.createdDateTime || "").localeCompare(a.createdDateTime || "")
    )[0];
  if (!latest?.id) {
    return { text: null, createdAt: null, status: "empty" };
  }

  const res = await graphFetch(
    userId,
    `/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(latest.id)}/content`,
    { headers: { Accept: "text/vtt" } }
  );
  if (res.status === 404) {
    return { text: null, createdAt: latest.createdDateTime || null, status: "not_found" };
  }
  if (res.status === 403) {
    return { text: null, createdAt: latest.createdDateTime || null, status: "forbidden" };
  }
  if (res.status === 202) {
    return { text: null, createdAt: latest.createdDateTime || null, status: "processing" };
  }
  if (!res.ok) {
    throw new MicrosoftGraphError(res.status, await res.text());
  }
  const raw = await res.text();
  const text = parseWebVttTranscript(raw);
  return {
    text: text || null,
    createdAt: latest.createdDateTime || null,
    status: text ? "ok" : "empty",
  };
}

async function attachMeetingChat(
  userId: number,
  joinUrl: string | null
): Promise<{ chatId: string | null; chatMessages: TeamsChatMessage[] }> {
  if (!joinUrl) return { chatId: null, chatMessages: [] };
  try {
    const chat = await findMeetingChatByJoinUrl(userId, joinUrl);
    if (!chat) return { chatId: null, chatMessages: [] };
    const chatMessages = await listTeamsChatMessages(userId, chat.id, {
      top: 40,
    });
    return { chatId: chat.id, chatMessages };
  } catch {
    return { chatId: null, chatMessages: [] };
  }
}

export async function getMeetingTranscript(input: {
  userId: number;
  eventId?: string | null;
  calendarId?: string | null;
  joinUrl?: string | null;
  chatId?: string | null;
  issueId?: number | null;
}): Promise<MeetingTranscriptResult> {
  const { userId } = input;
  let eventId = input.eventId?.trim() || null;
  let calendarId = input.calendarId?.trim() || null;
  let joinUrl = input.joinUrl?.trim() || null;
  let chatId = input.chatId?.trim() || null;
  let issueId = input.issueId ?? null;
  let subject: string | null = null;

  if (chatId && (!joinUrl || !eventId)) {
    const chat = await getTeamsChat(userId, chatId);
    if (chat) {
      subject = chat.title || subject;
      joinUrl = joinUrl || chat.joinUrl;
      eventId = eventId || chat.calendarEventId;
    }
  }

  if (issueId != null && !eventId) {
    const stamp = getPrimaryMariCalendarStampForIssue(
      userId,
      issueId,
      zurichYmd()
    );
    if (stamp) {
      eventId = stamp.eventId;
      calendarId = stamp.calendarId;
      subject = stamp.title;
    }
  }

  if (eventId && !joinUrl) {
    const ev = await getOutlookEventMeetingInfo(userId, eventId, calendarId);
    if (ev) {
      subject = ev.subject || subject;
      joinUrl = ev.joinUrl;
    }
  }

  if (!joinUrl) {
    return result({
      status: "no_meeting",
      subject,
      eventId,
      issueId,
      hint: "Kein Teams-Meeting an diesem Termin — Transkript nur bei Online-Meetings.",
    });
  }

  const meeting = await lookupOnlineMeetingId(userId, joinUrl, chatId);
  let transcript: Awaited<ReturnType<typeof fetchTranscriptContent>> | null =
    null;
  if (meeting?.id) {
    subject = meeting.subject || subject;
    transcript = await fetchTranscriptContent(userId, meeting.id);
  }

  const chat = await attachMeetingChat(userId, joinUrl);
  if (transcript?.status === "ok" && transcript.text) {
    return result({
      status: "ok",
      subject,
      joinUrl,
      eventId,
      issueId,
      text: transcript.text,
      createdAt: transcript.createdAt,
      chatId: chat.chatId,
      chatMessages: chat.chatMessages,
      hint: "",
    });
  }

  const status = transcript?.status || (meeting ? "empty" : "not_found");
  const hint =
    status === "forbidden"
      ? "Transkript-Recht fehlt oder Meeting gehört einem anderen Organisator. Unter Konto Microsoft 365 neu verbinden (OnlineMeetings.Read + OnlineMeetingTranscript.Read.All)."
      : status === "processing"
        ? "Transkript wird noch verarbeitet. Später erneut öffnen."
        : chat.chatMessages.length > 0
          ? "Kein offizielles Transkript — Meeting-Chat als Ersatz."
          : EMPTY_HINT;

  return result({
    status,
    subject,
    joinUrl,
    eventId,
    issueId,
    createdAt: transcript?.createdAt ?? null,
    chatId: chat.chatId,
    chatMessages: chat.chatMessages,
    hint,
  });
}
