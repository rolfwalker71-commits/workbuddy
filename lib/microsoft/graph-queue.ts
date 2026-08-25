/**
 * Process-wide Microsoft Graph mailbox gate.
 * Graph allows ~4 concurrent calls per app + mailbox; we stay at 2 and retry 429/503.
 * Multiple browser sessions for the same user share this map in one Node process.
 */

export const GRAPH_MAILBOX_CONCURRENCY = 2;
export const GRAPH_THROTTLE_RETRIES = 4;
export const GRAPH_RETRY_AFTER_CAP_MS = 8_000;

type Gate = {
  inFlight: number;
  waiters: Array<() => void>;
};

const gates = new Map<number, Gate>();

function gateFor(userId: number): Gate {
  let gate = gates.get(userId);
  if (!gate) {
    gate = { inFlight: 0, waiters: [] };
    gates.set(userId, gate);
  }
  return gate;
}

export function resetMicrosoftGraphSlotsForTests(): void {
  gates.clear();
}

export function microsoftGraphSlotSnapshot(userId: number): {
  inFlight: number;
  waiting: number;
} {
  const gate = gates.get(userId);
  return {
    inFlight: gate?.inFlight ?? 0,
    waiting: gate?.waiters.length ?? 0,
  };
}

export function isGraphThrottleStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/** Retry-After seconds, HTTP-date, or x-ms-retry-after-ms. Falls back to backoff. */
export function parseGraphRetryAfterMs(
  headers: Headers,
  attempt: number
): number {
  const msRaw =
    headers.get("retry-after-ms") || headers.get("x-ms-retry-after-ms");
  if (msRaw) {
    const ms = Number(msRaw);
    if (Number.isFinite(ms) && ms >= 0) {
      return Math.min(Math.max(0, ms), GRAPH_RETRY_AFTER_CAP_MS);
    }
  }
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, GRAPH_RETRY_AFTER_CAP_MS);
    }
    const when = Date.parse(retryAfter);
    if (Number.isFinite(when)) {
      return Math.min(Math.max(0, when - Date.now()), GRAPH_RETRY_AFTER_CAP_MS);
    }
  }
  return Math.min(500 * 2 ** attempt, GRAPH_RETRY_AFTER_CAP_MS);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withMicrosoftGraphSlot<T>(
  userId: number,
  work: () => Promise<T>
): Promise<T> {
  const gate = gateFor(userId);
  while (gate.inFlight >= GRAPH_MAILBOX_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      gate.waiters.push(resolve);
    });
  }
  gate.inFlight += 1;
  try {
    return await work();
  } finally {
    gate.inFlight -= 1;
    const next = gate.waiters.shift();
    if (next) next();
    else if (gate.inFlight === 0) gates.delete(userId);
  }
}
