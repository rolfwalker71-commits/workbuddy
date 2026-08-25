import { outboundFetch } from "@/lib/net/outbound-fetch";
import type { MariAnalyzeModule } from "@/lib/mari/analyze-modules";

export type VendorDocHit = {
  source: string;
  title: string;
  url: string;
  snippet: string;
};

const SAP_HELP_ORIGIN = "https://help.sap.com";
const CORESUITE_SEARCH =
  "https://helpdesk.coresystems.ch/api/v2/help_center/articles/search.json";
const FETCH_MS = 8_000;
const MAX_HITS_PER_SOURCE = 5;
const MAX_HITS_TOTAL = 12;

function clipSnippet(s: string, max = 280): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
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
  label: string
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await outboundFetch(
      url,
      {
        method: "GET",
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
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

function parseSapHits(raw: unknown, sourceLabel: string): VendorDocHit[] {
  if (!raw || typeof raw !== "object") return [];
  const data = (raw as { data?: { results?: unknown } }).data;
  const results = Array.isArray(data?.results) ? data.results : [];
  const hits: VendorDocHit[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title || "").trim();
    const url = absoluteHelpUrl(String(o.url || o.productPageUrl || ""));
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    hits.push({
      source: sourceLabel,
      title,
      url,
      snippet: clipSnippet(String(o.snippet || o.description || "")),
    });
    if (hits.length >= MAX_HITS_PER_SOURCE) break;
  }
  return hits;
}

function parseZendeskHits(raw: unknown, sourceLabel: string): VendorDocHit[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits: VendorDocHit[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title || "").trim();
    const url = String(o.html_url || o.url || "").trim();
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    hits.push({
      source: sourceLabel,
      title,
      url,
      snippet: clipSnippet(String(o.snippet || o.body || "")),
    });
    if (hits.length >= MAX_HITS_PER_SOURCE) break;
  }
  return hits;
}

async function searchSapHelp(
  module: MariAnalyzeModule,
  query: string
): Promise<VendorDocHit[]> {
  if (!module.sapProductId || !query) return [];
  const url = new URL("https://help.sap.com/http.svc/search");
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("state", "PRODUCTION");
  url.searchParams.set("product", module.sapProductId);
  const raw = await fetchJson(url.toString(), "SAP Help");
  return parseSapHits(raw, module.label);
}

async function searchCoresuiteHelp(query: string): Promise<VendorDocHit[]> {
  if (!query) return [];
  const url = new URL(CORESUITE_SEARCH);
  url.searchParams.set("query", query);
  url.searchParams.set("locale", "en-us");
  const raw = await fetchJson(url.toString(), "Coresystems Helpdesk");
  return parseZendeskHits(raw, "Coresuite");
}

/** Live-Treffer aus Herstellerportalen. Fehler/Timeout → leeres Array. */
export async function fetchAnalyzeVendorDocs(opts: {
  modules: readonly MariAnalyzeModule[];
  query: string;
}): Promise<VendorDocHit[]> {
  const query = opts.query.trim();
  if (!query || opts.modules.length === 0) return [];

  const jobs: Array<Promise<VendorDocHit[]>> = [];
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
  const hits: VendorDocHit[] = [];
  const seen = new Set<string>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const hit of result.value) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      hits.push(hit);
      if (hits.length >= MAX_HITS_TOTAL) return hits;
    }
  }
  return hits;
}

export function formatVendorDocHitsForPrompt(hits: VendorDocHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h) => {
    const snip = h.snippet ? `\n  ${h.snippet}` : "";
    return `- [${h.source}] ${h.title}\n  ${h.url}${snip}`;
  });
  return `HERSTELLER-TREFFER (live aus den gewählten Portalen — nur diese nutzen, keine Extra-Notes erfinden):
${lines.join("\n")}`;
}
