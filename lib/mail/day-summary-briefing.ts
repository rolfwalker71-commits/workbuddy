export type DayBriefingBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: DayBriefingItem[] };

export type DayBriefingItem = {
  text: string;
  kind: "task" | "event" | null;
};

export type DayBriefingClusterHint = {
  index: number;
  company: string;
  theme: string;
  taskTitles: string[];
  eventTitles: string[];
};

export type DayBriefingItemMatch = {
  kind: "task" | "event";
  clusterIndex: number;
};

const ACTION_TAG = /\[(Aufgabe|Termin)\]/gi;
const PERSON_NAME =
  /\b[A-ZÄÖÜ][a-zäöüß'-]+(?:\s+[A-ZÄÖÜ][a-zäöüß'-]+){1,2}\b/g;
const NOT_PERSON =
  /\b(gmbh|ag|ltd|inc|sa|kg|group|support|info|azure|sap|crm|sla|mrp)\b/i;

export function stripDaySummaryMarkup(raw: string): string {
  return raw
    .replace(ACTION_TAG, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[-*•]\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function parseDaySummaryBriefing(raw: string): DayBriefingBlock[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (looksStructured(text)) return parseStructured(text);
  return parseProseFallback(text);
}

function looksStructured(text: string): boolean {
  return /(?:^|\n)\s*[-*•]\s+\S/.test(text) || /\n\n/.test(text);
}

function parseStructured(text: string): DayBriefingBlock[] {
  const blocks: DayBriefingBlock[] = [];
  let bullets: DayBriefingItem[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push({ type: "ul", items: bullets });
    bullets = [];
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      bullets.push(parseItem(bullet[1] || ""));
      continue;
    }
    flushBullets();
    blocks.push({ type: "p", text: stripTags(trimmed) });
  }
  flushBullets();
  return blocks;
}

function parseProseFallback(text: string): DayBriefingBlock[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  if (sentences.length <= 2) {
    return sentences.map((s) => ({ type: "p" as const, text: s }));
  }
  const leadCount = sentences.length >= 6 ? 2 : 1;
  // Four sentences read as lead + two bullets + close, not lead + three bullets.
  const closeCount = sentences.length >= 4 ? 1 : 0;
  const lead = sentences.slice(0, leadCount);
  const close = closeCount ? sentences.slice(-closeCount) : [];
  const mid = sentences.slice(leadCount, sentences.length - close.length);
  const blocks: DayBriefingBlock[] = lead.map((s) => ({
    type: "p",
    text: s,
  }));
  if (mid.length > 0) {
    blocks.push({
      type: "ul",
      items: mid.map((s) => parseItem(s)),
    });
  }
  for (const s of close) blocks.push({ type: "p", text: s });
  return blocks;
}

function splitSentences(text: string): string[] {
  return text
    // A dot after a digit is an ordinal, not a sentence end ("Am 4. September").
    .split(/(?<=[^\d][.!?])\s+(?=[A-ZÄÖÜ])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseItem(raw: string): DayBriefingItem {
  const kind = /\[Aufgabe\]/i.test(raw)
    ? "task"
    : /\[Termin\]/i.test(raw)
      ? "event"
      : null;
  return { text: stripTags(raw), kind };
}

function stripTags(raw: string): string {
  return raw.replace(ACTION_TAG, "").replace(/\s{2,}/g, " ").trim();
}

export function collectPersonNames(
  text: string,
  extras: readonly string[] = []
): string[] {
  const found = new Set<string>();
  for (const extra of extras) {
    const t = extra.trim();
    if (t && looksLikePersonName(t)) found.add(t);
  }
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const t = (m[1] || "").trim();
    if (t && looksLikePersonName(t)) found.add(t);
  }
  const plain = text.replace(/\*\*/g, "");
  for (const m of plain.matchAll(PERSON_NAME)) {
    const t = m[0].trim();
    if (looksLikePersonName(t)) found.add(t);
  }
  return [...found].sort((a, b) => b.length - a.length);
}

export function looksLikePersonName(value: string): boolean {
  const t = value.trim();
  if (!t || NOT_PERSON.test(t) || t.length > 48) return false;
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    return /^[A-ZÄÖÜ][a-zäöüß'-]{2,}$/.test(parts[0] || "") && t.length >= 4;
  }
  if (parts.length > 3) return false;
  return parts.every((p) => /^[A-ZÄÖÜ][a-zäöüß'-]+$/.test(p));
}

export function matchBriefingItemToCluster(
  item: DayBriefingItem,
  clusters: readonly DayBriefingClusterHint[]
): DayBriefingItemMatch | null {
  if (clusters.length === 0) return null;
  const tokens = tokensOf(item.text);
  if (tokens.length === 0) return null;

  let best: DayBriefingItemMatch | null = null;
  let bestScore = 0;
  for (const cluster of clusters) {
    const taskScore = scoreAgainst(
      tokens,
      [cluster.company, cluster.theme, ...cluster.taskTitles].join(" ")
    );
    const eventScore = scoreAgainst(
      tokens,
      [cluster.company, cluster.theme, ...cluster.eventTitles].join(" ")
    );
    const prefer = item.kind;
    const useEvent =
      prefer === "event"
        ? eventScore >= taskScore
        : prefer === "task"
          ? false
          : eventScore > taskScore && cluster.eventTitles.length > 0;
    const score = useEvent ? eventScore : taskScore;
    const kind: "task" | "event" =
      prefer ??
      (useEvent && cluster.eventTitles.length > 0 ? "event" : "task");
    if (score > bestScore) {
      bestScore = score;
      best = { kind, clusterIndex: cluster.index };
    }
  }
  if (bestScore < 2) return item.kind ? best : null;
  return best;
}

function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöü0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function scoreAgainst(tokens: string[], haystack: string): number {
  const set = new Set(tokensOf(haystack));
  return tokens.filter((t) => set.has(t)).length;
}

export function briefingClustersFromAnalysis(
  clusters: readonly {
    company?: string | null;
    theme?: string | null;
    tasks?: Array<{ title?: string | null }>;
    events?: Array<{ title?: string | null }>;
  }[]
): DayBriefingClusterHint[] {
  return clusters.map((c, index) => ({
    index,
    company: (c.company || "").trim(),
    theme: (c.theme || "").trim(),
    taskTitles: (c.tasks || [])
      .map((t) => (t.title || "").trim())
      .filter(Boolean),
    eventTitles: (c.events || [])
      .map((t) => (t.title || "").trim())
      .filter(Boolean),
  }));
}
