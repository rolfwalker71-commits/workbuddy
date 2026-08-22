import { NextResponse } from "next/server";
import {
  isAuthError,
  requireModule,
  runWithRequestSecrets,
  type AuthContext,
} from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";

/**
 * Auth + per-user MARI/AI ALS for the rest of the handler.
 * Do not rely on `enterWith` from `getAuthContext` after `await`.
 */
export async function withMariModule<T>(
  fn: (auth: AuthContext) => T | Promise<T>
): Promise<T | NextResponse> {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  return runWithRequestSecrets(auth, () => fn(auth));
}
