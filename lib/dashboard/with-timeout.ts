/** Per-provider ceiling so one hanging Graph/Gmail/MARI call cannot stall Home. */
export const HOME_PROVIDER_TIMEOUT_MS = 3000;

export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = work.then(
    (value) => value,
    () => fallback
  );
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([guarded, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
