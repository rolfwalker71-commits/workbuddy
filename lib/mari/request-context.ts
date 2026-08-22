import { AsyncLocalStorage } from "node:async_hooks";

type MariRequestStore = {
  /** App user id for per-user MARI credentials. */
  userId: number | null;
};

const mariRequestAls = new AsyncLocalStorage<MariRequestStore>();

/**
 * Best-effort bind for the current async resource only.
 * After `await` in a caller (Next.js route), this store is lost — use
 * `runWithMariUser` / `runWithRequestSecrets` for the rest of the handler.
 */
export function enterMariRequestUser(userId: number | null): void {
  mariRequestAls.enterWith({ userId });
}

export function getMariRequestUserId(): number | null {
  return mariRequestAls.getStore()?.userId ?? null;
}

export function runWithMariUser<T>(userId: number | null, fn: () => T): T {
  return mariRequestAls.run({ userId }, fn);
}
