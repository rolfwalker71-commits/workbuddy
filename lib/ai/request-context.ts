import { AsyncLocalStorage } from "node:async_hooks";

type AiRequestStore = {
  userId: number | null;
};

const aiRequestAls = new AsyncLocalStorage<AiRequestStore>();

export function enterAiRequestUser(userId: number | null): void {
  aiRequestAls.enterWith({ userId });
}

export function getAiRequestUserId(): number | null {
  return aiRequestAls.getStore()?.userId ?? null;
}

export function runWithAiUser<T>(userId: number | null, fn: () => T): T {
  return aiRequestAls.run({ userId }, fn);
}
