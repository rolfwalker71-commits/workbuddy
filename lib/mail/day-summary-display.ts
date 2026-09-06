export type DaySummaryChips = {
  task: boolean;
  event: boolean;
  mail: boolean;
  customer: string | null;
  customerAng: boolean;
};

export type DaySummaryBullet = {
  text: string;
  chips: DaySummaryChips;
};

export type DaySummaryBriefingModel = {
  intro: string | null;
  bullets: DaySummaryBullet[];
};

export type DaySummaryChipSource = {
  company?: string | null;
  theme?: string | null;
  summary?: string | null;
  status?: string | null;
  tasks?: Array<{ title?: string | null; dueDate?: string | null }>;
  events?: Array<{ title?: string | null; date?: string | null }>;
  replies?: Array<{ subject?: string | null }>;
};

export type DaySummaryTextPart = {
  text: string;
  bold: boolean;
};

const WEEKDAYS = new Set([
  "montag",
  "dienstag",
  "mittwoch",
  "donnerstag",
  "freitag",
  "samstag",
  "sonntag",
]);

const MONTHS = new Set([
  "januar",
  "februar",
  "märz",
  "maerz",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "dezember",
]);

const NOT_A_NAME = new Set([
  ...WEEKDAYS,
  ...MONTHS,
  "azure",
  "sap",
  "sla",
  "maringo",
  "buddy",
  "work",
  "schweiz",
  "österreich",
  "oesterreich",
  "microsoft",
  "outlook",
  "teams",
  "gmail",
  "google",
]);

const TOKEN_STOP = new Set([
  "aber",
  "auch",
  "dann",
  "dass",
  "dazu",
  "eine",
  "einem",
  "einen",
  "einer",
  "eines",
  "etwa",
  "heute",
  "kann",
  "mehr",
  "mit",
  "nach",
  "noch",
  "oder",
  "sich",
  "sind",
  "soll",
  "sollen",
  "sowie",
  "über",
  "und",
  "unter",
  "vom",
  "von",
  "vor",
  "wenn",
  "wird",
  "wurde",
  "wurden",
]);

const FULL_NAME_RE =
  /\b([A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?(?:\s+[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?){1,2})\b/g;

const AFTER_PREP_RE =
  /\b(?:für|von|an|bei|mit|durch|gegenüber)\s+([A-ZÄÖÜ][a-zäöüß]+)\b/g;

const GENERIC_COMPANY = new Set([
  "unbekannt",
  "unknown",
  "kunde",
  "customer",
  "intern",
  "internal",
]);

const ANG_COMPANY_KEYS = new Set([
  "ang",
  "angroup",
  "angroupone",
  "angroupinternational",
]);

const EMPTY_CHIPS: DaySummaryChips = {
  task: false,
  event: false,
  mail: false,
  customer: null,
  customerAng: false,
};

function companyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function isAngCompanyLabel(company: string | null | undefined): boolean {
  return ANG_COMPANY_KEYS.has(companyKey((company || "").trim()));
}

function customerLabel(company: string | null | undefined): string | null {
  const name = (company || "").trim();
  if (name.length < 2) return null;
  if (GENERIC_COMPANY.has(name.toLowerCase())) return null;
  if (isAngCompanyLabel(name)) return "ANG";
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
}

function stripListPrefix(text: string): string {
  return text.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim();
}

/** One-line preview without markdown list markers or bold. */
export function plainDaySummaryPreview(text: string, max = 220): string {
  const compact = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function splitSentences(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  // Do not split dates like «4. September».
  const parts = trimmed.split(/(?<=(?<!\d)[.!?])\s+(?=[A-ZÄÖÜ])/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseListLines(text: string): { intro: string | null; items: string[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const items: string[] = [];
  const introParts: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const list = /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line);
    if (list) {
      inList = true;
      items.push(stripListPrefix(line));
      continue;
    }
    if (inList) {
      items.push(stripListPrefix(line));
    } else {
      introParts.push(line);
    }
  }
  const intro = introParts.join(" ").trim() || null;
  return { intro, items };
}

export function parseDaySummaryStructure(text: string): {
  intro: string | null;
  items: string[];
} {
  const raw = (text || "").trim();
  if (!raw) return { intro: null, items: [] };
  const listed = parseListLines(raw);
  if (listed.items.length > 0) {
    return listed;
  }
  const sentences = splitSentences(raw);
  if (sentences.length <= 1) {
    return { intro: sentences[0] || raw, items: [] };
  }
  return {
    intro: sentences[0] || null,
    items: sentences.slice(1),
  };
}

function isNameToken(word: string): boolean {
  return !NOT_A_NAME.has(word.toLowerCase());
}

function isFullName(name: string): boolean {
  return name.split(/\s+/).every(isNameToken);
}

function collectMarkedNames(text: string): string[] {
  const out: string[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = m[1].trim();
    if (n) out.push(n);
  }
  return out;
}

function applyRegexNames(
  text: string,
  extraNames: string[]
): DaySummaryTextPart[] {
  const hits: Array<{ start: number; end: number }> = [];
  const add = (start: number, end: number) => {
    if (start < 0 || end <= start) return;
    if (hits.some((h) => start < h.end && end > h.start)) return;
    hits.push({ start, end });
  };

  for (const name of extraNames) {
    if (name.length < 2) continue;
    const re = new RegExp(
      `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "g"
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) add(m.index, m.index + m[0].length);
  }

  FULL_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FULL_NAME_RE.exec(text))) {
    if (isFullName(m[1])) add(m.index, m.index + m[1].length);
  }

  AFTER_PREP_RE.lastIndex = 0;
  while ((m = AFTER_PREP_RE.exec(text))) {
    const name = m[1];
    if (isNameToken(name)) {
      add(m.index + m[0].length - name.length, m.index + m[0].length);
    }
  }

  hits.sort((a, b) => a.start - b.start);
  const parts: DaySummaryTextPart[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) {
      parts.push({ text: text.slice(cursor, h.start), bold: false });
    }
    parts.push({ text: text.slice(h.start, h.end), bold: true });
    cursor = h.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), bold: false });
  }
  return parts.length > 0 ? parts : [{ text, bold: false }];
}

/** Bold **markdown** names plus detected person names. */
export function daySummaryTextParts(
  text: string,
  extraNames: string[] = []
): DaySummaryTextPart[] {
  const marked = collectMarkedNames(text);
  const stripped = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  return applyRegexNames(stripped, [...marked, ...extraNames]);
}

function normalizeHay(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function significantTokens(text: string): string[] {
  return normalizeHay(text)
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !TOKEN_STOP.has(t));
}

function clusterHaystack(cluster: DaySummaryChipSource): string {
  const bits = [
    cluster.company,
    cluster.theme,
    cluster.summary,
    ...(cluster.tasks || []).map((t) => t.title),
    ...(cluster.events || []).map((e) => e.title),
    ...(cluster.replies || []).map((r) => r.subject),
  ];
  return bits.filter(Boolean).join(" ");
}

export function matchDaySummaryChips(
  bullet: string,
  clusters: DaySummaryChipSource[]
): DaySummaryChips {
  if (clusters.length === 0) return { ...EMPTY_CHIPS };
  const tokens = significantTokens(bullet);
  if (tokens.length === 0) return { ...EMPTY_CHIPS };

  let best: { cluster: DaySummaryChipSource; score: number } | null = null;
  for (const cluster of clusters) {
    const hay = normalizeHay(clusterHaystack(cluster));
    let score = 0;
    const company = (cluster.company || "").trim();
    if (company.length >= 4 && hay && normalizeHay(bullet).includes(normalizeHay(company))) {
      score += 3;
    }
    const theme = (cluster.theme || "").trim();
    if (theme.length >= 4 && normalizeHay(bullet).includes(normalizeHay(theme))) {
      score += 2;
    }
    for (const tok of tokens) {
      if (hay.includes(tok)) score += 1;
    }
    if (!best || score > best.score) best = { cluster, score };
  }
  if (!best || best.score < 2) return { ...EMPTY_CHIPS };
  const customer = customerLabel(best.cluster.company);
  return {
    task: (best.cluster.tasks || []).length > 0,
    event: (best.cluster.events || []).length > 0,
    mail: (best.cluster.replies || []).length > 0,
    customer,
    customerAng: Boolean(customer) && isAngCompanyLabel(best.cluster.company),
  };
}

export function buildDaySummaryBriefing(
  text: string,
  clusters: DaySummaryChipSource[] = []
): DaySummaryBriefingModel {
  const { intro, items } = parseDaySummaryStructure(text);
  return {
    intro,
    bullets: items.map((item) => ({
      text: item,
      chips: matchDaySummaryChips(item, clusters),
    })),
  };
}
