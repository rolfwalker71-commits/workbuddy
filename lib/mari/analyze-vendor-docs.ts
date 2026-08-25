import { outboundFetch } from "@/lib/net/outbound-fetch";
import type { MariAnalyzeModule } from "@/lib/mari/analyze-modules";

export type VendorDocHit = {
  source: string;
  title: string;
  url: string;
  snippet: string;
  /** Full-ish article/section for the top hits (plain text). */
  section?: string;
};

type SearchHit = VendorDocHit & {
  loio?: string;
  articleId?: string;
};

const SAP_HELP_ORIGIN = "https://help.sap.com";
const CORESUITE_SEARCH =
  "https://helpdesk.coresystems.ch/api/v2/help_center/articles/search.json";
const FETCH_MS = 8_000;
const PAGE_FETCH_MS = 10_000;
const MAX_HITS_PER_SOURCE = 5;
const MAX_HITS_TOTAL = 12;
const MAX_ENRICH = 3;
const SECTION_MAX = 3500;

function clipSnippet(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function clipSection(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

export function htmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function absoluteHelpUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return `${SAP_HELP_ORIGIN}${t}`;
  return `${SAP_HELP_ORIGIN}/${t}`;
}

export function buildVendorDocSearchQuery(opts: {
  briefDescription?: string | null;
  requestText?: string | null;
}): string {
  const subject = (opts.briefDescription || "").replace(/\s+/g, " ").trim();
  const request = (opts.requestText || "").replace(/\s+/g, " ").trim();
  const tables = (
    `${subject} ${request}`.match(
      /\b(O[A-Z]{3}|SBO_SP_[A-Za-z0-9_]+|M_[A-Z0-9_]+)\b/g
    ) || []
  ).slice(0, 4);
  const base = subject || request.slice(0, 120);
  const extra = tables.filter((t) => !base.toUpperCase().includes(t.toUpperCase()));
  const q = [base, ...extra].filter(Boolean).join(" ").trim();
  return q.slice(0, 160);
}

async function fetchJson(
  url: string,
  label: string,
  timeoutMs = FETCH_MS
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await outboundFetch(
      url,
      {
        method: "GET",
        signal: ctrl.signal,
        headers: {
          Accept: "application/json",
          Referer: SAP_HELP_ORIGIN,
        },
      },
      { retries: 0, label }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseSapHits(raw: unknown, sourceLabel: string): SearchHit[] {
  if (!raw || typeof raw !== "object") return [];
  const data = (raw as { data?: { results?: unknown } }).data;
  const results = Array.isArray(data?.results) ? data.results : [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title || "").trim();
    const url = absoluteHelpUrl(String(o.url || o.productPageUrl || ""));
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const loio = String(o.loio || "").trim();
    hits.push({
      source: sourceLabel,
      title,
      url,
      snippet: clipSnippet(String(o.snippet || o.description || ""), 280),
      loio: loio && loio !== "undefined" ? loio : undefined,
    });
    if (hits.length >= MAX_HITS_PER_SOURCE) break;
  }
  return hits;
}

function parseZendeskHits(raw: unknown, sourceLabel: string): SearchHit[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title || "").trim();
    const url = String(o.html_url || o.url || "").trim();
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const body = htmlToPlain(String(o.body || o.snippet || ""));
    hits.push({
      source: sourceLabel,
      title,
      url,
      snippet: clipSnippet(body || String(o.snippet || ""), 280),
      articleId: o.id != null ? String(o.id) : undefined,
    });
    if (hits.length >= MAX_HITS_PER_SOURCE) break;
  }
  return hits;
}

async function searchSapHelp(
  module: MariAnalyzeModule,
  query: string
): Promise<SearchHit[]> {
  if (!module.sapProductId || !query) return [];
  const url = new URL("https://help.sap.com/http.svc/search");
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("state", "PRODUCTION");
  url.searchParams.set("product", module.sapProductId);
  const raw = await fetchJson(url.toString(), "SAP Help");
  return parseSapHits(raw, module.label);
}

async function searchCoresuiteHelp(query: string): Promise<SearchHit[]> {
  if (!query) return [];
  const url = new URL(CORESUITE_SEARCH);
  url.searchParams.set("query", query);
  url.searchParams.set("locale", "en-us");
  const raw = await fetchJson(url.toString(), "Coresystems Helpdesk");
  return parseZendeskHits(raw, "Coresuite");
}

function parseDocsPath(urlOrPath: string): {
  product: string;
  deliverable: string;
  file: string;
} | null {
  try {
    const u = new URL(urlOrPath, SAP_HELP_ORIGIN);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] !== "docs" || parts.length < 4) return null;
    return {
      product: parts[1],
      deliverable: parts[2],
      file: parts[3],
    };
  } catch {
    return null;
  }
}

async function fetchSapPageSection(
  hit: SearchHit
): Promise<string | null> {
  const path = parseDocsPath(hit.url);
  const topic = hit.loio ? `${hit.loio}.html` : path?.file || "";
  if (!topic && !path) return null;

  const metaUrl = new URL("https://help.sap.com/http.svc/deliverableMetadata");
  if (path?.product) metaUrl.searchParams.set("product_url", path.product);
  if (topic) metaUrl.searchParams.set("topic_url", topic);
  if (path?.deliverable) metaUrl.searchParams.set("deliverable_url", path.deliverable);
  metaUrl.searchParams.set("version", "LATEST");
  metaUrl.searchParams.set("language", "en-US");
  metaUrl.searchParams.set("deliverableInfo", "1");
  metaUrl.searchParams.set("loadlandingpageontopicnotfound", "true");

  const meta = await fetchJson(metaUrl.toString(), "SAP Help page", PAGE_FETCH_MS);
  if (!meta || typeof meta !== "object") return null;
  const data = (meta as { data?: Record<string, unknown> }).data;
  const deliverable = data?.deliverable as
    | { id?: unknown; buildNo?: unknown }
    | undefined;
  const deliverableId = deliverable?.id;
  const buildNo = deliverable?.buildNo;
  const filePath = String(data?.filePath || topic || "").trim();
  if (deliverableId == null || buildNo == null || !filePath) return null;

  const pageUrl = new URL("https://help.sap.com/http.svc/pagecontent");
  pageUrl.searchParams.set("deliverableInfo", "1");
  pageUrl.searchParams.set("deliverable_id", String(deliverableId));
  pageUrl.searchParams.set("buildNo", String(buildNo));
  pageUrl.searchParams.set("file_path", filePath);
  const page = await fetchJson(pageUrl.toString(), "SAP Help page", PAGE_FETCH_MS);
  if (!page || typeof page !== "object") return null;
  const bodyHtml = String(
    (page as { data?: { body?: unknown } }).data?.body || ""
  );
  const plain = htmlToPlain(bodyHtml);
  return plain ? clipSection(plain, SECTION_MAX) : null;
}

async function fetchZendeskArticle(articleId: string): Promise<string | null> {
  const url = `https://helpdesk.coresystems.ch/api/v2/help_center/articles/${encodeURIComponent(articleId)}.json`;
  const raw = await fetchJson(url, "Coresystems Helpdesk", PAGE_FETCH_MS);
  if (!raw || typeof raw !== "object") return null;
  const article = (raw as { article?: { body?: unknown } }).article;
  const plain = htmlToPlain(String(article?.body || ""));
  return plain ? clipSection(plain, SECTION_MAX) : null;
}

async function enrichTopHits(hits: SearchHit[]): Promise<VendorDocHit[]> {
  const top = hits.slice(0, MAX_ENRICH);
  const rest = hits.slice(MAX_ENRICH);
  const enriched = await Promise.all(
    top.map(async (hit): Promise<VendorDocHit> => {
      let section: string | null = null;
      try {
        if (hit.articleId) {
          section = await fetchZendeskArticle(hit.articleId);
        } else if (hit.url.includes("help.sap.com")) {
          section = await fetchSapPageSection(hit);
        }
      } catch {
        section = null;
      }
      return {
        source: hit.source,
        title: hit.title,
        url: hit.url,
        snippet: hit.snippet,
        ...(section ? { section } : {}),
      };
    })
  );
  return [
    ...enriched,
    ...rest.map(({ source, title, url, snippet }) => ({
      source,
      title,
      url,
      snippet,
    })),
  ];
}

/** Live-Treffer aus Herstellerportalen. Fehler/Timeout → leeres Array. */
export async function fetchAnalyzeVendorDocs(opts: {
  modules: readonly MariAnalyzeModule[];
  query: string;
}): Promise<VendorDocHit[]> {
  const query = opts.query.trim();
  if (!query || opts.modules.length === 0) return [];

  const jobs: Array<Promise<SearchHit[]>> = [];
  for (const module of opts.modules) {
    if (module.sapProductId) {
      jobs.push(searchSapHelp(module, query));
    }
    if (module.id === "coresuite") {
      jobs.push(searchCoresuiteHelp(query));
    }
  }
  if (jobs.length === 0) return [];

  const settled = await Promise.allSettled(jobs);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const hit of result.value) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      hits.push(hit);
      if (hits.length >= MAX_HITS_TOTAL) break;
    }
    if (hits.length >= MAX_HITS_TOTAL) break;
  }
  if (hits.length === 0) return [];
  return enrichTopHits(hits);
}

export function formatVendorDocHitsForPrompt(hits: VendorDocHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h) => {
    const body = h.section || h.snippet;
    const block = body ? `\n  ${body}` : "";
    return `- [${h.source}] ${h.title}\n  ${h.url}${block}`;
  });
  return `HERSTELLER-TREFFER (live aus den gewählten Portalen — Top-Treffer als Abschnitt, Rest als Snippet; nur diese nutzen, keine Extra-Notes erfinden):
${lines.join("\n")}`;
}
