import { z } from "zod";
import {
  getChatClient,
  getChatJsonRequestExtras,
  getChatModel,
  hasChatKey,
} from "@/lib/ai/client";
import type { TeamsChatMessage } from "@/lib/microsoft/teams-chats";

export type ChatTaskSuggestion = {
  title: string;
  notes: string | null;
  reason: string;
  source: "heuristic" | "ai";
};

const ACTION_RE =
  /(?:\?|bitte|kannst du|könntest du|können wir|müssen wir|todo|to-?do|action item|aufgabe|follow[- ]up|nachfassen|ich (?:schick|send|mach|prüf|klär|kümmer|übernehm)|i(?:'ll| will) (?:send|check|follow|share)|can you|could you|we need to|let me (?:send|check))/i;

const NOISE_RE =
  /^(ok|okay|danke|thanks|thx|jo|ja|nein|yes|no|lol|👍|🙏|gg)[\s!.]*$/i;

export function heuristicChatTaskSuggestions(
  messages: Array<Pick<TeamsChatMessage, "from" | "text">>
): ChatTaskSuggestion[] {
  const out: ChatTaskSuggestion[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    const text = msg.text.replace(/\s+/g, " ").trim();
    if (text.length < 8 || text.length > 400) continue;
    if (NOISE_RE.test(text)) continue;
    if (!ACTION_RE.test(text)) continue;
    const title = toTaskTitle(text);
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      notes: msg.from ? `Aus Chat · ${msg.from}` : "Aus Teams-Chat",
      reason: "Offene Frage, Zusage oder Action Item im Chat.",
      source: "heuristic",
    });
    if (out.length >= 6) break;
  }
  return out;
}

function toTaskTitle(text: string): string {
  let t = text.replace(/^[@\w.\-]+\s*:\s*/, "");
  t = t.replace(/^(bitte|hey|hallo|hi)\s+/i, "");
  if (t.length > 120) t = `${t.slice(0, 117).trimEnd()}…`;
  return t || "Offener Punkt aus Chat";
}

const AiSuggestionSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        notes: z.string().trim().max(2000).nullable().optional(),
        reason: z.string().trim().max(400).optional(),
      })
    )
    .max(6)
    .default([]),
});

function packMessages(
  messages: Array<Pick<TeamsChatMessage, "from" | "text">>
): string {
  return messages
    .slice(-40)
    .map((m) => {
      const who = m.from || "Unbekannt";
      const body = m.text.replace(/\s+/g, " ").trim().slice(0, 400);
      return `${who}: ${body}`;
    })
    .join("\n");
}

export async function suggestTasksFromChatMessages(
  messages: Array<Pick<TeamsChatMessage, "from" | "text">>,
  context?: { label?: string }
): Promise<{ suggestions: ChatTaskSuggestion[]; usedAi: boolean }> {
  const heuristic = heuristicChatTaskSuggestions(messages);
  if (!hasChatKey() || messages.length === 0) {
    return { suggestions: heuristic, usedAi: false };
  }

  const packed = packMessages(messages);
  if (!packed.trim()) return { suggestions: heuristic, usedAi: false };

  try {
    const client = getChatClient();
    const model = getChatModel();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Du extrahierst konservativ Restarbeit aus einem Teams-Chat. Nur echte offene Punkte: Fragen, Zusagen («ich schicke X»), Bitten, Follow-ups. Keine Smalltalk-, Danke- oder bereits erledigten Sätze. Maximal 5 Aufgaben, Deutsch, kurze Titel. JSON: {\"tasks\":[{\"title\":\"…\",\"notes\":\"…\"|null,\"reason\":\"…\"}]}",
        },
        {
          role: "user",
          content: `${context?.label ? `Kontext: ${context.label}\n\n` : ""}${packed}`,
        },
      ],
      ...getChatJsonRequestExtras(),
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = AiSuggestionSchema.safeParse(JSON.parse(raw || "{}"));
    if (!parsed.success) return { suggestions: heuristic, usedAi: false };
    const ai: ChatTaskSuggestion[] = parsed.data.tasks.map((t) => ({
      title: t.title,
      notes: t.notes?.trim() || null,
      reason: t.reason?.trim() || "KI: offener Punkt im Chat.",
      source: "ai",
    }));
    if (ai.length === 0) return { suggestions: heuristic, usedAi: true };
    return { suggestions: mergeSuggestions(ai, heuristic), usedAi: true };
  } catch {
    return { suggestions: heuristic, usedAi: false };
  }
}

function mergeSuggestions(
  primary: ChatTaskSuggestion[],
  extra: ChatTaskSuggestion[]
): ChatTaskSuggestion[] {
  const seen = new Set<string>();
  const out: ChatTaskSuggestion[] = [];
  for (const s of [...primary, ...extra]) {
    const key = s.title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}
