import { z } from "zod";
import {
  getChatClient,
  getChatJsonRequestExtras,
  getChatModel,
  hasChatKey,
} from "@/lib/ai/client";
import { zurichYmdFromIso } from "@/lib/mail/mail-threads";
import type { TeamsChatMessage } from "@/lib/microsoft/teams-chats";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Hm = z.string().regex(/^\d{2}:\d{2}$/);

function aiString(max: number) {
  return z.preprocess((v) => {
    if (v == null) return "";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v !== "string") return "";
    return v;
  }, z.string().max(max));
}

function aiStringRequired(max: number, fallback: string) {
  return z.preprocess((v) => {
    if (v == null) return fallback;
    if (typeof v === "number" || typeof v === "boolean") {
      const s = String(v).trim();
      return s || fallback;
    }
    if (typeof v !== "string") return fallback;
    const t = v.trim();
    return t || fallback;
  }, z.string().min(1).max(max));
}

const aiNullableString = (max: number) =>
  z.preprocess((v) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string") return null;
    return v;
  }, z.string().max(max).nullable());

export const TeamsAnalysisTaskSchema = z.object({
  title: aiStringRequired(200, "Aufgabe"),
  notes: aiNullableString(2000).optional(),
  dueDate: Ymd.nullable().optional(),
  reason: aiString(800).optional(),
  sourceChatId: aiNullableString(400).optional(),
  sourceChatTitle: aiNullableString(200).optional(),
});

export const TeamsAnalysisEventSchema = z.object({
  title: aiStringRequired(200, "Termin"),
  date: Ymd,
  startTime: Hm.nullable().optional(),
  endTime: Hm.nullable().optional(),
  allDay: z.boolean().optional(),
  location: aiNullableString(300).optional(),
  notes: aiNullableString(2000).optional(),
  reason: aiString(800).optional(),
  sourceChatId: aiNullableString(400).optional(),
  sourceChatTitle: aiNullableString(200).optional(),
});

export const TeamsAnalysisReplySchema = z.object({
  to: aiString(200),
  body: aiString(4000),
  reason: aiString(800).optional(),
  sourceChatId: aiNullableString(400).optional(),
  sourceChatTitle: aiNullableString(200).optional(),
});

function aiItemArray<T extends z.ZodTypeAny>(itemSchema: T, max: number) {
  return z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    const out: z.infer<T>[] = [];
    for (const el of v) {
      const r = itemSchema.safeParse(el);
      if (r.success) out.push(r.data);
      if (out.length >= max) break;
    }
    return out;
  }, z.array(itemSchema).max(max));
}

export const TeamsAnalysisClusterSchema = z.object({
  sourceChatId: aiNullableString(400).optional(),
  sourceChatTitle: aiStringRequired(200, "Chat"),
  theme: aiNullableString(200).optional(),
  summary: aiString(2200),
  tasks: aiItemArray(TeamsAnalysisTaskSchema, 6).default([]),
  events: aiItemArray(TeamsAnalysisEventSchema, 4).default([]),
  replies: aiItemArray(TeamsAnalysisReplySchema, 3).default([]),
});

export const TeamsChatAnalysisSchema = z.object({
  summary: aiString(3200),
  clusters: z.array(TeamsAnalysisClusterSchema).max(16).default([]),
});

export type TeamsAnalysisTask = z.infer<typeof TeamsAnalysisTaskSchema>;
export type TeamsAnalysisEvent = z.infer<typeof TeamsAnalysisEventSchema>;
export type TeamsAnalysisReply = z.infer<typeof TeamsAnalysisReplySchema>;
export type TeamsAnalysisCluster = z.infer<typeof TeamsAnalysisClusterSchema>;

export type TeamsChatAnalysis = {
  summary: string;
  clusters: TeamsAnalysisCluster[];
  tasks: TeamsAnalysisTask[];
  events: TeamsAnalysisEvent[];
  replies: TeamsAnalysisReply[];
};

export type TeamsThreadForAnalysis = {
  id: string;
  title: string;
  kind?: "chat" | "channel";
  messages: Array<Pick<TeamsChatMessage, "from" | "text" | "createdAt">>;
  lastActiveAt?: string | null;
  preview?: string | null;
  joinUrl?: string | null;
  calendarEventId?: string | null;
};

export const TEAMS_DAY_CHAT_LIMIT = 12;
export const TEAMS_DAY_MESSAGES_PER_CHAT = 25;
export const TEAMS_THREAD_MESSAGE_LIMIT = 40;

function swiss(text: string): string {
  return text.replace(/\u00df/g, "ss").replace(/\u1e9e/g, "SS");
}

function walkSwiss<T>(value: T): T {
  if (typeof value === "string") return swiss(value) as T;
  if (Array.isArray(value)) return value.map((v) => walkSwiss(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walkSwiss(v);
    }
    return out as T;
  }
  return value;
}

export function emptyTeamsAnalysis(summary: string): TeamsChatAnalysis {
  return {
    summary: swiss(summary),
    clusters: [],
    tasks: [],
    events: [],
    replies: [],
  };
}

export function chatsActiveOnZurichDay<
  T extends { lastUpdatedAt?: string | null },
>(chats: T[], dayYmd: string): T[] {
  return chats.filter((c) => zurichYmdFromIso(c.lastUpdatedAt) === dayYmd);
}

export function filterMessagesForZurichDay(
  messages: Array<Pick<TeamsChatMessage, "createdAt" | "from" | "text">>,
  dayYmd: string
): Array<Pick<TeamsChatMessage, "createdAt" | "from" | "text">> {
  return messages.filter((m) => zurichYmdFromIso(m.createdAt) === dayYmd);
}

export function packTeamsThread(
  thread: TeamsThreadForAnalysis,
  options?: { maxMessages?: number; maxChars?: number }
): string {
  const maxMessages = options?.maxMessages ?? TEAMS_THREAD_MESSAGE_LIMIT;
  const maxChars = options?.maxChars ?? 400;
  const lines = thread.messages.slice(-maxMessages).map((m) => {
    const when = m.createdAt
      ? m.createdAt.slice(0, 16).replace("T", " ")
      : "";
    const who = m.from?.trim() || "Unbekannt";
    const body = m.text.replace(/\s+/g, " ").trim().slice(0, maxChars);
    return `${when ? `[${when}] ` : ""}${who}: ${body}`;
  });
  return lines.filter((l) => l.trim()).join("\n");
}

function withSource(
  item: {
    sourceChatId?: string | null;
    sourceChatTitle?: string | null;
  },
  thread: TeamsThreadForAnalysis
) {
  return {
    sourceChatId: item.sourceChatId?.trim() || thread.id,
    sourceChatTitle: item.sourceChatTitle?.trim() || thread.title,
  };
}

export function sanitizeTeamsAnalysis(
  raw: unknown,
  threads: TeamsThreadForAnalysis[]
): TeamsChatAnalysis {
  const parsed = TeamsChatAnalysisSchema.safeParse(raw);
  const byId = new Map(threads.map((t) => [t.id, t]));
  const byTitle = new Map(
    threads.map((t) => [t.title.toLowerCase(), t] as const)
  );
  const fallback = threads[0] || {
    id: "",
    title: "Chat",
    messages: [],
  };

  const clustersIn = parsed.success ? parsed.data.clusters : [];
  const summary = parsed.success
    ? parsed.data.summary.trim()
    : "Keine gültige Analyse.";

  const clusters: TeamsAnalysisCluster[] = [];
  for (const c of clustersIn) {
    const match =
      (c.sourceChatId && byId.get(c.sourceChatId)) ||
      byTitle.get(c.sourceChatTitle.toLowerCase()) ||
      (threads.length === 1 ? fallback : null);
    const thread = match || fallback;
    const tasks = c.tasks
      .filter((t) => t.title.trim() && t.title !== "Aufgabe")
      .map((t) => ({ ...t, ...withSource(t, thread) }))
      .slice(0, 6);
    const events = c.events
      .filter((e) => Ymd.safeParse(e.date).success && e.title.trim())
      .map((e) => ({ ...e, ...withSource(e, thread) }))
      .slice(0, 4);
    const replies = c.replies
      .filter((r) => r.body.trim())
      .map((r) => ({ ...r, ...withSource(r, thread) }))
      .slice(0, 3);
    clusters.push({
      sourceChatId: thread.id || c.sourceChatId || null,
      sourceChatTitle: thread.title || c.sourceChatTitle || "Chat",
      theme: c.theme?.trim() || null,
      summary: c.summary.trim(),
      tasks,
      events,
      replies,
    });
    if (clusters.length >= 16) break;
  }

  if (clusters.length === 0 && threads.length === 1) {
    clusters.push({
      sourceChatId: fallback.id || null,
      sourceChatTitle: fallback.title,
      theme: null,
      summary,
      tasks: [],
      events: [],
      replies: [],
    });
  }

  return walkSwiss({
    summary: summary || "Analyse ohne Kurzfassung.",
    clusters,
    tasks: clusters.flatMap((c) => c.tasks),
    events: clusters.flatMap((c) => c.events),
    replies: clusters.flatMap((c) => c.replies),
  });
}

const SYSTEM = `Du bist Buddy, Büro-Assistent (Schweiz, Europe/Zurich, Datumformat YYYY-MM-DD).
Analysiere Teams-Chats und erkenne, ob daraus Aufgaben, Kalendertermine und/oder Antwort-Entwürfe entstehen sollten.

WICHTIG:
- Nur vorschlagen, was wirklich offen und speicherwürdig ist. Smalltalk, Danke, reine Infos → leere Listen.
- Keine erfundenen Daten. Relative Angaben («morgen», «Montag 14 Uhr») anhand «Heute» in YYYY-MM-DD / HH:mm auflösen.
- kind task: offene Bitten, Zusagen («ich schicke X»), Follow-ups, Action Items. dueDate nur wenn Frist klar.
- kind event: nur bei klarem Termin/Meeting mit Datum. startTime/endTime als HH:mm wenn genannt, sonst allDay.
- replies: nur wenn eine kurze Antwort im Chat sinnvoll ist (Zusage, Rückfrage, Bestätigung). body auf Deutsch, höflich und knapp. to = Name der Person, an die die Antwort geht.
- sourceChatId und sourceChatTitle aus dem jeweiligen Chat/Kanal exakt echoen.
- sourceChatTitle ist der echte Name (Chatname oder «Team · Kanal»). Nie «Teams-Kanal» erfinden.
- theme optional: kurzes Thema der Unterhaltung. Identität bleibt sourceChatId / sourceChatTitle.
- Keine Dubletten über Chats hinweg, wenn es dieselbe Aufgabe ist.
- Antworte NUR als JSON-Objekt.`;

function buildUserPrompt(
  threads: TeamsThreadForAnalysis[],
  todayIso: string,
  label: string
): string {
  const packed = threads
    .map((t, i) => {
      const body = packTeamsThread(t, {
        maxMessages: threads.length > 1 ? 20 : TEAMS_THREAD_MESSAGE_LIMIT,
        maxChars: threads.length > 1 ? 280 : 400,
      });
      return `CHAT ${i + 1}
sourceChatId: ${t.id}
sourceChatTitle: ${t.title}
Nachrichten:
${body || "(leer)"}`;
    })
    .join("\n\n");

  return `Heute (Europe/Zurich): ${todayIso}
Kontext: ${label}

PFLICHT: Genau ${threads.length} Cluster — einer pro Chat/Kanal. sourceChatId und sourceChatTitle echoen (echter Name, nie «Teams-Kanal»).

${packed}

JSON:
{
  "summary": "1–3 Sätze worum es geht",
  "clusters": [
    {
      "sourceChatId": "exakte Id",
      "sourceChatTitle": "exakter Titel",
      "theme": "optional kurzes Thema"|null,
      "summary": "2–4 Sätze",
      "tasks": [{ "title": "…", "notes": "…"|null, "dueDate": "YYYY-MM-DD"|null, "reason": "…", "sourceChatId": "…", "sourceChatTitle": "…" }],
      "events": [{ "title": "…", "date": "YYYY-MM-DD", "startTime": "HH:mm"|null, "endTime": "HH:mm"|null, "allDay": false, "location": null, "notes": null, "reason": "…", "sourceChatId": "…", "sourceChatTitle": "…" }],
      "replies": [{ "to": "Name", "body": "kurze Antwort DE", "reason": "…", "sourceChatId": "…", "sourceChatTitle": "…" }]
    }
  ]
}`;
}

export async function analyzeTeamsThreads(
  threads: TeamsThreadForAnalysis[],
  options: { todayIso: string; label: string }
): Promise<TeamsChatAnalysis> {
  if (!hasChatKey()) {
    throw new Error("Chat-/Analyse-API-Key fehlt (Einstellungen → KI-API).");
  }
  const usable = threads.filter((t) =>
    t.messages.some((m) => m.text.replace(/\s+/g, " ").trim())
  );
  if (usable.length === 0) {
    return emptyTeamsAnalysis("Keine Nachrichten zum Analysieren.");
  }

  const client = getChatClient();
  const model = getChatModel();
  const BATCH = usable.length > 8 ? 4 : usable.length > 4 ? 6 : usable.length;
  const clusters: TeamsAnalysisCluster[] = [];
  const summaries: string[] = [];

  for (let i = 0; i < usable.length; i += BATCH) {
    const batch = usable.slice(i, i + BATCH);
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: buildUserPrompt(batch, options.todayIso, options.label),
        },
      ],
      ...getChatJsonRequestExtras(),
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "";
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(
        raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "") || "{}"
      );
    } catch {
      throw new Error("AI-Antwort war kein gültiges JSON.");
    }
    const part = sanitizeTeamsAnalysis(parsed, batch);
    if (part.summary.trim()) summaries.push(part.summary.trim());
    clusters.push(...part.clusters);
  }

  const summary =
    usable.length === 1
      ? summaries[0] || clusters[0]?.summary || "Analyse fertig."
      : summaries[0] ||
        `${clusters.length} Chat(s) geprüft — Vorschläge unten, nichts wurde angelegt.`;

  return walkSwiss({
    summary,
    clusters,
    tasks: clusters.flatMap((c) => c.tasks),
    events: clusters.flatMap((c) => c.events),
    replies: clusters.flatMap((c) => c.replies),
  });
}
