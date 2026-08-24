import dns from "node:dns";

/** Call once at process start. Node 17+ prefers IPv6; Docker/WSL often has no working AAAA. */
export function preferIpv4Dns(): void {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    /* ignore */
  }
}

preferIpv4Dns();

function errorCauseCode(error: unknown): string | null {
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    if (
      current &&
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code
    ) {
      return String((current as { code: unknown }).code);
    }
    if (current instanceof Error) {
      current = current.cause;
      continue;
    }
    break;
  }
  return null;
}

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

export function isTransientNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (/fetch failed/i.test(msg)) return true;
  const code = errorCauseCode(error);
  return code != null && TRANSIENT_CODES.has(code);
}

export function formatOutboundNetworkError(
  error: unknown,
  hostLabel: string
): Error {
  if (!isTransientNetworkError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const code = errorCauseCode(error);
  return new Error(
    `${hostLabel} ist gerade nicht erreichbar` +
      (code ? ` (${code})` : "") +
      ". Bitte kurz erneut versuchen."
  );
}

function hostLabelFromUrl(url: string | URL): string {
  try {
    const host = (typeof url === "string" ? new URL(url) : url).hostname;
    if (host.includes("graph.microsoft.com")) return "Microsoft Graph";
    if (host.includes("login.microsoftonline.com")) {
      return "Microsoft-Anmeldung";
    }
    if (host.includes("googleapis.com") || host.includes("google.com")) {
      return "Google";
    }
    return host;
  } catch {
    return "Der Dienst";
  }
}

export async function outboundFetch(
  url: string | URL,
  init?: RequestInit,
  opts?: { retries?: number; label?: string }
): Promise<Response> {
  const retries = opts?.retries ?? 2;
  const label = opts?.label ?? hostLabelFromUrl(url);
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        cache: init?.cache ?? "no-store",
      });
    } catch (error) {
      last = error;
      if (attempt < retries && isTransientNetworkError(error)) {
        await new Promise((r) => setTimeout(r, 280 * (attempt + 1)));
        continue;
      }
      throw formatOutboundNetworkError(error, label);
    }
  }
  throw formatOutboundNetworkError(last, label);
}
