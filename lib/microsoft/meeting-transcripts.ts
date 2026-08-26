import { graphFetch, graphJson, getMicrosoftMe, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { getPrimaryMariCalendarStampForIssue } from "@/lib/mari/calendar-stamp";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  findMeetingChatByJoinUrl,
  getTeamsChat,
  listTeamsChatMessages,
  type TeamsChatMessage,
} from "@/lib/microsoft/teams-chats";
import { escapeODataString, parseWebVttTranscript } from "@/lib/microsoft/teams-text";
import {
  hasMicrosoftOnlineMeetingsScope,
  hasMicrosoftTranscriptScope,
} from "@/lib/microsoft/oauth";

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
  /** True only when the stored token still lacks meeting/transcript scopes. */
  needsReconnect: boolean;
};

type GraphOnlineMeeting = {
  id?: string;
  subject?: string | null;
  joinWebUrl?: string | null;
};

type MeetingHit = GraphOnlineMeeting & { pathPrefix: string };

type GraphTranscript = {
  id?: string;
  createdDateTime?: string | null;
};

type GraphEventLite = {
  id?: string;
  subject?: string | null;
  isOnlineMeeting?: boolean;
  onlineMeeting?: {
    joinUrl?: string | null;
    conferenceId?: string | null;
  } | null;
  onlineMeetingUrl?: string | null;
  organizer?: {
    emailAddress?: { address?: string | null; name?: string | null } | null;
  } | null;
};

const EMPTY_HINT =
  "Kein Transkript. Teams speichert eines nur, wenn die Transkription im Meeting eingeschaltet war und die Verarbeitung fertig ist.";

const RECONNECT_HINT =
  "Im Token fehlen OnlineMeetings.Read oder OnlineMeetingTranscript.Read.All. Unter Konto → Microsoft 365 «Neu verbinden» (Zustimmungsdialog). Die Azure-Freigabe allein reicht nicht.";

const OTHER_ORGANIZER_HINT =
  "Graph findet dieses Meeting nicht unter deinen Online-Meetings. Häufig: ein anderer Organisator, das Meeting ist abgelaufen, oder die Join-URL weicht ab. Delegiert lesbar sind vor allem Meetings, die du organisiert hast.";

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
    needsReconnect: Boolean(partial.needsReconnect),
  };
}

export function parseGraphErrorMessage(body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string; code?: string };
    };
    const msg = json.error?.message?.trim();
    if (msg) return msg.slice(0, 220);
  } catch {
    /* raw body */
  }
  const raw = body.replace(/\s+/g, " ").trim();
  return raw ? raw.slice(0, 220) : null;
}

export function isOtherOrganizerGraphError(
  body: string | null | undefined
): boolean {
  const t = `${body || ""}`.toLowerCase();
  return (
    t.includes("organizer") ||
    t.includes("not the organizer") ||
    t.includes("different from the user") ||
    t.includes("another user")
  );
}

/** JoinWebUrl filters — Outlook and Teams often differ by query/hash. */
export function joinWebUrlFilterValues(joinUrl: string): string[] {
  const raw = joinUrl.trim();
  if (!raw) return [];
  const out: string[] = [];
  const add = (value: string) => {
    const t = value.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(raw);
  try {
    const withQuery = new URL(raw);
    withQuery.hash = "";
    add(withQuery.toString());
    const noQuery = new URL(withQuery.toString());
    noQuery.search = "";
    add(noQuery.toString());
    add(noQuery.toString().replace(/\/$/, ""));
  } catch {
    /* keep raw */
  }
  return out;
}

export function transcriptFailureHint(input: {
  status: MeetingTranscriptStatus;
  hasMeetingScope: boolean;
  hasTranscriptScope: boolean;
  graphBody?: string | null;
  hasChatMessages: boolean;
  meetingResolved: boolean;
}): string {
  const missingScope = !input.hasMeetingScope || !input.hasTranscriptScope;
  if (missingScope && (input.status === "forbidden" || !input.meetingResolved)) {
    return input.hasChatMessages
      ? `${RECONNECT_HINT} Meeting-Chat als Ersatz.`
      : RECONNECT_HINT;
  }

  const graphMsg = parseGraphErrorMessage(input.graphBody);
  if (input.status === "processing") {
    return "Transkript wird noch verarbeitet. Später erneut öffnen.";
  }
  if (input.status === "forbidden") {
    if (isOtherOrganizerGraphError(input.graphBody) || !missingScope) {
      const extra = graphMsg ? ` Graph: ${graphMsg}` : "";
      return `Graph verweigert das Transkript (403). Delegiert lesbar sind vor allem Meetings, die du organisiert hast.${extra}`;
    }
    return RECONNECT_HINT;
  }
  if (input.status === "not_found" || (!input.meetingResolved && input.status !== "empty")) {
    return input.hasChatMessages
      ? "Kein offizielles Transkript (Meeting oft von einem anderen Organisator). Meeting-Chat als Ersatz."
      : OTHER_ORGANIZER_HINT;
  }
  if (input.hasChatMessages) {
    return "Kein offizielles Transkript — Meeting-Chat als Ersatz.";
  }
  return EMPTY_HINT;
}

export async function getOutlookEventMeetingInfo(
  userId: number,
  eventId: string,
  calendarId?: string | null
): Promise<{
  subject: string | null;
  joinUrl: string | null;
  conferenceId: string | null;
  organizerEmail: string | null;
} | null> {
  const id = eventId.trim();
  if (!id) return null;
  const path = calendarId?.trim()
    ? `/me/calendars/${encodeURIComponent(calendarId.trim())}/events/${encodeURIComponent(id)}`
    : `/me/events/${encodeURIComponent(id)}`;
  try {
    const ev = await graphJson<GraphEventLite>(
      userId,
      `${path}?$select=id,subject,isOnlineMeeting,onlineMeeting,onlineMeetingUrl,organizer`
    );
    const joinUrl =
      ev.onlineMeeting?.joinUrl?.trim() || ev.onlineMeetingUrl?.trim() || null;
    return {
      subject: ev.subject?.trim() || null,
      joinUrl,
      conferenceId: ev.onlineMeeting?.conferenceId?.trim() || null,
      organizerEmail: ev.organizer?.emailAddress?.address?.trim() || null,
    };
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function lookupOnlineMeeting(
  userId: number,
  filter: string,
  pathPrefix = "/me/onlineMeetings"
): Promise<MeetingHit | null> {
  const encoded = encodeURIComponent(filter);
  try {
    const data = await graphJson<{ value?: GraphOnlineMeeting[] }>(
      userId,
      `${pathPrefix}?$filter=${encoded}&$select=id,subject,joinWebUrl`
    );
    const hit = data.value?.find((m) => m.id);
    return hit?.id ? { ...hit, pathPrefix } : null;
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
  opts?: {
    chatId?: string | null;
    conferenceId?: string | null;
    organizerEmail?: string | null;
  }
): Promise<MeetingHit | null> {
  for (const url of joinWebUrlFilterValues(joinUrl)) {
    const found = await lookupOnlineMeeting(
      userId,
      `JoinWebUrl eq '${escapeODataString(url)}'`
    );
    if (found) return found;
  }

  const threadId = opts?.chatId?.trim();
  if (threadId) {
    const byThread = await lookupOnlineMeeting(
      userId,
      `ChatInfo/ThreadId eq '${escapeODataString(threadId)}'`
    );
    if (byThread) return byThread;
  }

  const conferenceId = opts?.conferenceId?.trim();
  if (conferenceId) {
    const byJoinId = await lookupOnlineMeeting(
      userId,
      `joinMeetingIdSettings/joinMeetingId eq '${escapeODataString(conferenceId)}'`
    );
    if (byJoinId) return byJoinId;
  }

  const organizer = opts?.organizerEmail?.trim();
  if (organizer && joinUrl) {
    const viaOrganizer = await lookupMeetingViaOrganizer(
      userId,
      organizer,
      joinUrl
    );
    if (viaOrganizer) return viaOrganizer;
  }

  return null;
}

/** Delegated attendee path: /users/{organizerUpn}/onlineMeetings?$filter=JoinWebUrl */
async function lookupMeetingViaOrganizer(
  userId: number,
  organizerEmail: string,
  joinUrl: string
): Promise<MeetingHit | null> {
  const upn = organizerEmail.trim();
  if (!upn || !upn.includes("@")) return null;
  try {
    const me = await getMicrosoftMe(userId);
    const mine = new Set(
      [me.mail, me.userPrincipalName]
        .map((v) => v?.trim().toLowerCase())
        .filter((v): v is string => Boolean(v))
    );
    if (mine.has(upn.toLowerCase())) return null;
  } catch {
    /* still try organizer path */
  }
  const prefix = `/users/${encodeURIComponent(upn)}/onlineMeetings`;
  for (const url of joinWebUrlFilterValues(joinUrl)) {
    const found = await lookupOnlineMeeting(
      userId,
      `JoinWebUrl eq '${escapeODataString(url)}'`,
      prefix
    );
    if (found) return found;
  }
  return null;
}

async function fetchTranscriptContent(
  userId: number,
  meetingId: string,
  pathPrefix = "/me/onlineMeetings"
): Promise<{
  text: string | null;
  createdAt: string | null;
  status: MeetingTranscriptStatus;
  graphBody: string | null;
}> {
  let listed: { value?: GraphTranscript[] };
  try {
    listed = await graphJson<{ value?: GraphTranscript[] }>(
      userId,
      `${pathPrefix}/${encodeURIComponent(meetingId)}/transcripts`
    );
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.status === 404) {
      return { text: null, createdAt: null, status: "not_found", graphBody: error.body };
    }
    if (error instanceof MicrosoftGraphError && error.status === 403) {
      return { text: null, createdAt: null, status: "forbidden", graphBody: error.body };
    }
    throw error;
  }
  const latest = (listed.value || [])
    .filter((t) => t.id)
    .sort((a, b) =>
      (b.createdDateTime || "").localeCompare(a.createdDateTime || "")
    )[0];
  if (!latest?.id) {
    return { text: null, createdAt: null, status: "empty", graphBody: null };
  }

  const res = await graphFetch(
    userId,
    `${pathPrefix}/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(latest.id)}/content`,
    { headers: { Accept: "text/vtt" } }
  );
  if (res.status === 404) {
    return {
      text: null,
      createdAt: latest.createdDateTime || null,
      status: "not_found",
      graphBody: await res.text().catch(() => ""),
    };
  }
  if (res.status === 403) {
    return {
      text: null,
      createdAt: latest.createdDateTime || null,
      status: "forbidden",
      graphBody: await res.text().catch(() => ""),
    };
  }
  if (res.status === 202) {
    return {
      text: null,
      createdAt: latest.createdDateTime || null,
      status: "processing",
      graphBody: null,
    };
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
    graphBody: null,
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
  let conferenceId: string | null = null;
  let organizerEmail: string | null = null;

  const hasMeetingScope = hasMicrosoftOnlineMeetingsScope(userId);
  const hasTranscriptScope = hasMicrosoftTranscriptScope(userId);
  const missingScope = !hasMeetingScope || !hasTranscriptScope;

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

  if (eventId) {
    try {
      const ev = await getOutlookEventMeetingInfo(userId, eventId, calendarId);
      if (ev) {
        subject = ev.subject || subject;
        conferenceId = ev.conferenceId;
        organizerEmail = ev.organizerEmail;
        joinUrl = joinUrl || ev.joinUrl;
      }
    } catch {
      /* joinUrl from input/chat still usable */
    }
  }

  if (!joinUrl) {
    return result({
      status: "no_meeting",
      subject,
      eventId,
      issueId,
      hint: "Kein Teams-Meeting an diesem Termin — Transkript nur bei Online-Meetings.",
      needsReconnect: false,
    });
  }

  if (!chatId) {
    try {
      const found = await findMeetingChatByJoinUrl(userId, joinUrl);
      if (found) chatId = found.id;
    } catch {
      /* chat optional for lookup */
    }
  }

  const meeting = await lookupOnlineMeetingId(userId, joinUrl, {
    chatId,
    conferenceId,
    organizerEmail,
  });
  let transcript: Awaited<ReturnType<typeof fetchTranscriptContent>> | null =
    null;
  if (meeting?.id) {
    subject = meeting.subject || subject;
    transcript = await fetchTranscriptContent(
      userId,
      meeting.id,
      meeting.pathPrefix
    );
    if (
      (transcript.status === "forbidden" || transcript.status === "not_found") &&
      organizerEmail &&
      meeting.pathPrefix === "/me/onlineMeetings"
    ) {
      const alt = await fetchTranscriptContent(
        userId,
        meeting.id,
        `/users/${encodeURIComponent(organizerEmail)}/onlineMeetings`
      );
      if (alt.status === "ok" || alt.status === "processing" || alt.status === "empty") {
        transcript = alt;
      }
    }
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
      needsReconnect: false,
    });
  }

  const meetingResolved = Boolean(meeting?.id);
  const status = transcript?.status || (meetingResolved ? "empty" : "not_found");
  const hint = transcriptFailureHint({
    status,
    hasMeetingScope,
    hasTranscriptScope,
    graphBody: transcript?.graphBody ?? null,
    hasChatMessages: chat.chatMessages.length > 0,
    meetingResolved,
  });

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
    needsReconnect:
      missingScope &&
      (status === "forbidden" || status === "not_found") &&
      chat.chatMessages.length === 0,
  });
}
