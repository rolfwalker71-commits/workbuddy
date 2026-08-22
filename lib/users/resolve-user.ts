import { getAuthConfiguration } from "@/lib/auth/config";
import { hashPassword } from "@/lib/auth/password";
import type { AuthContext } from "@/lib/auth/current-user";
import {
  createAppUser,
  getAppUserByUsername,
  setUserModules,
  type AppUserRow,
} from "@/lib/users/queries";
import { ALL_APP_MODULES } from "@/lib/users/modules";

/**
 * App-user id for per-user secrets (OAuth tokens, OpenAI, MARI).
 * Env-admin sessions without userId resolve to / create a matching users row.
 */
export function resolveAppUserId(
  auth: Pick<AuthContext, "userId" | "username" | "isAdmin">
): number | null {
  if (auth.userId != null && auth.userId > 0) return auth.userId;
  const linked = getAppUserByUsername(auth.username);
  return linked?.id ?? null;
}

export async function ensureEnvAdminUser(): Promise<AppUserRow> {
  const auth = getAuthConfiguration();
  const existing = getAppUserByUsername(auth.username);
  if (existing) return existing;
  const placeholder = await hashPassword(
    `env-admin:${auth.username}:${Date.now()}`
  );
  const user = createAppUser({
    username: auth.username,
    email: `${auth.username}@workbuddy.local`,
    displayName: auth.username,
    passwordHash: placeholder,
    active: true,
    isAdmin: true,
  });
  setUserModules(user.id, [...ALL_APP_MODULES]);
  return user;
}
