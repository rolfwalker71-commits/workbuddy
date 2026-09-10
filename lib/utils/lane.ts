/**
 * A counting gate: at most `limit` tasks run at once, the rest queue in order.
 *
 * Unlike `mapWithConcurrency`, callers do not know about each other — this
 * bounds a shared resource across unrelated call sites, which is what an
 * upstream service with a hard parallelism limit needs.
 */
export type Lane = {
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** For assertions and diagnostics. */
  readonly active: number;
  readonly waiting: number;
};

export function createLane(limit: number): Lane {
  const max = Math.max(1, Math.trunc(limit) || 1);
  const queue: Array<() => void> = [];
  let active = 0;

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active < max) {
      active += 1;
    } else {
      // The releasing task hands its slot over, so `active` already counts us.
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active -= 1;
    }
  }

  return {
    run,
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
  };
}
