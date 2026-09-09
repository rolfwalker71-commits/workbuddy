/**
 * Run an async mapper over items with a bounded number in flight, keeping the
 * input order in the result. For fan-out against a remote API that should not
 * be hit with everything at once.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  if (items.length === 0) return out;
  const workers = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}
