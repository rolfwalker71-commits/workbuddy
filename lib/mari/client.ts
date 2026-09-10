import { getMariConfig, type MariConfig } from "@/lib/mari/config";
import { createLane } from "@/lib/utils/lane";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
  /**
   * Bumped on every successful login. A retry passes the generation whose
   * token failed, so a burst of concurrent failures shares one re-login
   * instead of each forcing its own.
   */
  generation: number;
};

/** Per MARI username — colleagues must not share the admin token. */
const tokenCaches = new Map<string, TokenCache>();
/** Single-flight logins per cache key (avoids stampede after expiry / 500). */
const tokenInflight = new Map<string, Promise<TokenCache>>();
let loginGeneration = 0;

export class MariApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "MariApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * MARI often returns opaque HTTP 500 ("An error has occurred.") for dead
 * sessions instead of 401. Treat those as refreshable once.
 *
 * Do not try to narrow this by how old the token is. MARI appears to invalidate
 * the previous session whenever the same user logs in again, so a token can be
 * dead seconds after it was issued — measured: a 500 on a 20s-old token
 * returned its data fine right after a re-login. An age-based guard withheld
 * contract labels on every booking. The cost of these retries is contained by
 * the request gate below, which keeps logins from racing live calls at all.
 */
export function mariStatusSuggestsStaleAuth(status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 500 ||
    status === 502 ||
    status === 503
  );
}

/**
 * Ceiling per MARI call. Matters more since requests are serialized: without
 * it one hung call blocks every other one behind the gate, with no way out but
 * restarting the process. Measured calls land at 35-250ms and a login at ~2s,
 * so this only ever fires on a genuinely stuck request.
 */
export const MARI_REQUEST_TIMEOUT_MS = 20_000;

/** An aborted fetch is a timeout, not a dead session — never retry-login it. */
export function isMariTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

function withTimeout(init: RequestInit): RequestInit {
  // A caller that brought its own signal owns cancellation.
  if (init.signal) return init;
  return { ...init, signal: AbortSignal.timeout(MARI_REQUEST_TIMEOUT_MS) };
}

async function fetchToken(cfg: MariConfig): Promise<TokenCache> {
  const body = new URLSearchParams({
    username: cfg.username,
    password: cfg.password,
    grant_type: "password",
  });
  const res = await fetch(
    `${cfg.baseUrl}/token`,
    withTimeout({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    })
  );
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new MariApiError(
      json?.error_description || json?.error || "MARI Login fehlgeschlagen",
      res.status,
      json
    );
  }
  const expiresIn = Number(json.expires_in) || 3600;
  // Refresh early — MARI sessions can die before advertised expiry.
  const skewSec = Math.max(120, Math.floor(expiresIn * 0.15));
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(30, expiresIn - skewSec) * 1000,
    generation: ++loginGeneration,
  };
}

function cacheKey(cfg: MariConfig): string {
  return `${cfg.baseUrl}::${cfg.username}`;
}

async function getAccessToken(
  cfg: MariConfig,
  opts?: { staleGeneration?: number }
): Promise<TokenCache> {
  const key = cacheKey(cfg);
  const cached = tokenCaches.get(key);
  const stale = opts?.staleGeneration;

  if (stale === undefined) {
    if (cached && cached.expiresAt > Date.now()) return cached;
  } else if (cached && cached.generation > stale) {
    // A concurrent failure already re-logged in after the token we used.
    return cached;
  } else {
    tokenCaches.delete(key);
  }

  // Always join an in-flight login: it can only return a token newer than the
  // one that just failed, so there is nothing to gain from a second one.
  let inflight = tokenInflight.get(key);
  if (!inflight) {
    const login = fetchToken(cfg)
      .then((next) => {
        tokenCaches.set(key, next);
        return next;
      })
      .finally(() => {
        if (tokenInflight.get(key) === login) {
          tokenInflight.delete(key);
        }
      });
    tokenInflight.set(key, login);
    inflight = login;
  }

  return inflight;
}

/** Call after credentials change in Einstellungen / User-Admin. */
export function clearMariTokenCache(username?: string | null): void {
  if (!username?.trim()) {
    tokenCaches.clear();
    tokenInflight.clear();
    return;
  }
  const needle = username.trim().toLowerCase();
  for (const key of [...tokenCaches.keys()]) {
    if (key.toLowerCase().endsWith(`::${needle}`)) {
      tokenCaches.delete(key);
    }
  }
  for (const key of [...tokenInflight.keys()]) {
    if (key.toLowerCase().endsWith(`::${needle}`)) {
      tokenInflight.delete(key);
    }
  }
}

export function requireMariConfig(): MariConfig {
  const cfg = getMariConfig();
  if (!cfg) {
    throw new MariApiError(
      "MARI nicht konfiguriert. Personalnummer unter Konto, REST-Zugang in der .env.",
      503
    );
  }
  return cfg;
}

/**
 * MARI tolerates parallel SQL but not parallel REST — measured, in two lanes.
 *
 * `/api/TimeKeepingLine/{id}` answered 40 of 40 requests issued one after
 * another, lost 24 of 40 with two in flight, and lost every single one from
 * four upwards. The list endpoints behave the same as soon as anything else is
 * in flight. MARI reports the overload as the same opaque
 * `{"Message":"An error has occurred."}` it uses for a dead session, so
 * parallel REST did not merely fail — it looked like an expired login and each
 * failure bought a ~2s re-login, which invalidated the session the calls still
 * running were using. Serialising REST is what makes the hours list return
 * complete contract labels at all.
 *
 * SQL is a different story: 20 SELECTs four deep came back clean, and stayed
 * clean while REST ran serially beside them. Putting SQL behind the same single
 * gate made booking recognition — which is nothing but SELECTs — crawl, so it
 * gets its own lane.
 */
const SQL_PATH = "/api/SystemToolsReadDataFromDB";
const mariSqlLane = createLane(4);
const mariRestLane = createLane(1);

export async function mariFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const lane = path.startsWith(SQL_PATH) ? mariSqlLane : mariRestLane;
  // The lane spans the retry too: a re-login must not race the calls that are
  // still using the old token, or it invalidates them mid-flight.
  return lane.run(() => mariFetchUnguarded(path, init));
}

async function mariFetchUnguarded(
  path: string,
  init: RequestInit = {},
  /** Internal: login generation whose token just failed. Set on the retry. */
  staleGeneration?: number
): Promise<Response> {
  const cfg = requireMariConfig();
  const auth = await getAccessToken(
    cfg,
    staleGeneration === undefined ? undefined : { staleGeneration }
  );
  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${auth.accessToken}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  let res: Response;
  try {
    res = await fetch(url, withTimeout({ ...init, headers, cache: "no-store" }));
  } catch (err) {
    if (isMariTimeoutError(err)) {
      // Fail fast rather than doubling the wait behind the gate.
      throw new MariApiError(
        `MARI hat auf ${path} nicht innerhalb von ${Math.round(
          MARI_REQUEST_TIMEOUT_MS / 1000
        )} Sekunden geantwortet.`,
        504
      );
    }
    // Transient network blip after idle — one re-login + retry.
    if (staleGeneration === undefined) {
      return mariFetchUnguarded(path, init, auth.generation);
    }
    throw err;
  }

  if (staleGeneration === undefined && mariStatusSuggestsStaleAuth(res.status)) {
    // Consume body so the socket can be reused; ignore content.
    await res.text().catch(() => "");
    return mariFetchUnguarded(path, init, auth.generation);
  }
  return res;
}

export async function mariJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await mariFetch(path, init);
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    const rawMsg =
      typeof json === "object" &&
      json &&
      "Message" in json &&
      typeof (json as { Message: unknown }).Message === "string"
        ? String((json as { Message: string }).Message).trim()
        : typeof json === "string"
          ? json.trim()
          : "";
    const generic =
      !rawMsg ||
      /^an error has occurred\.?$/i.test(rawMsg) ||
      /^error$/i.test(rawMsg);
    throw new MariApiError(
      generic ? `MARI HTTP ${res.status}` : rawMsg,
      res.status,
      json
    );
  }
  // Manche MARI-DELETEs liefern 200 ohne Body.
  return (json ?? null) as T;
}

/**
 * Tables this MARI schema does not expose.
 *
 * Several lookups walk a list of candidate tables — MARIProject, MARIProjects,
 * OPRJ, OCRD, OOAT — because the schema differs between installations. On this
 * one most of them do not exist, and each miss cost a full round trip: booking
 * recognition spent 3-6s per appointment re-asking for a table that has never
 * been there. A missing table stays missing for the life of the process.
 */
const missingSqlTables = new Set<string>();

export function missingSqlTableFromMessage(message: string): string | null {
  const hit = /Could not find table\/view\s+([A-Za-z0-9_]+)\s+in schema/i.exec(
    message
  );
  return hit?.[1] ?? null;
}

/** Only FROM/JOIN targets — a column may legitimately share a table's name. */
export function sqlTargetsTable(sql: string, tables: Set<string>): string | null {
  if (tables.size === 0) return null;
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+"?([A-Za-z0-9_]+)"?/gi)) {
    const name = m[1];
    if (name && tables.has(name.toUpperCase())) return name;
  }
  return null;
}

/** Test seam — the set is process-wide and must not leak between cases. */
export function resetMissingSqlTables(): void {
  missingSqlTables.clear();
}

function rememberMissingTable(message: unknown): void {
  const missing = missingSqlTableFromMessage(String(message ?? ""));
  if (missing) missingSqlTables.add(missing.toUpperCase());
}

/** Nur SELECT — HANA quoted identifiers. */
export async function mariSql<T extends Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  if (!/^\s*SELECT\b/i.test(sql) || /;/.test(sql)) {
    throw new MariApiError("Nur ein SELECT ohne Semikolon erlaubt.", 400);
  }
  const knownMissing = sqlTargetsTable(sql, missingSqlTables);
  if (knownMissing) {
    throw new MariApiError(
      `Tabelle ${knownMissing} existiert in diesem MARI-Schema nicht.`,
      400
    );
  }
  let rows: T[] | { Message?: string };
  try {
    rows = await mariJson<T[] | { Message?: string }>(
      "/api/SystemToolsReadDataFromDB",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ SQL: sql }),
      }
    );
  } catch (err) {
    if (err instanceof MariApiError) rememberMissingTable(err.message);
    throw err;
  }
  if (!Array.isArray(rows)) {
    rememberMissingTable((rows as { Message?: string })?.Message);
    throw new MariApiError(
      (rows as { Message?: string })?.Message || "SQL-Antwort ungültig",
      502,
      rows
    );
  }
  if (
    rows.length === 1 &&
    rows[0] &&
    typeof rows[0] === "object" &&
    "Message" in rows[0] &&
    typeof (rows[0] as unknown as { Message: unknown }).Message === "string"
  ) {
    const message = String((rows[0] as unknown as { Message: string }).Message);
    rememberMissingTable(message);
    throw new MariApiError(message, 502, rows[0]);
  }
  return rows;
}

export type MariPatchResult = {
  IMPORT_Feedback?: number;
  IMPORT_ErrorMessage?: string | null;
  IssueID?: number;
};

export async function mariPatchIssue(
  issueId: number,
  body: Record<string, unknown>
): Promise<MariPatchResult> {
  return mariJson<MariPatchResult>(`/api/SupportIssue/${issueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** POST /api/SupportIssue — neues Ticket (nicht /wopi/). */
export async function mariPostIssue(
  body: Record<string, unknown>
): Promise<MariPatchResult> {
  return mariJson<MariPatchResult>("/api/SupportIssue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function mariGetIssue(
  issueId: number
): Promise<Record<string, unknown>> {
  return mariJson<Record<string, unknown>>(`/api/SupportIssue/${issueId}`);
}

/** DELETE /api/SupportIssue/{id} — hartes Löschen inkl. Anhänge (Swagger). */
export async function mariDeleteIssue(
  issueId: number
): Promise<MariPatchResult | null> {
  return mariJson<MariPatchResult | null>(`/api/SupportIssue/${issueId}`, {
    method: "DELETE",
  });
}
