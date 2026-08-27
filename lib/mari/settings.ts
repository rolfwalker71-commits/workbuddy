import { getSetting, setSetting } from "@/lib/db/migrations";
import type { MariConfig } from "@/lib/mari/config";
import { getMariRequestUserId } from "@/lib/mari/request-context";
import { getAppUserById } from "@/lib/users/queries";

const KEY_BASE = "mari_rest_base_url";

export const DEFAULT_MARI_BASE =
  "https://marirestservice.an-group.international";

function envOrNull(key: string): string | null {
  const v = process.env[key]?.trim();
  return v || null;
}

export function getMariBaseUrl(): string {
  return (
    envOrNull("MARI_REST_BASE_URL") ||
    getSetting(KEY_BASE) ||
    DEFAULT_MARI_BASE
  ).replace(/\/$/, "");
}

export function getMariRestUsername(): string | null {
  return envOrNull("MARI_REST_USERNAME");
}

export function getMariRestPassword(): string | null {
  return envOrNull("MARI_REST_PASSWORD");
}

export function saveMariBaseUrl(value: string | null): void {
  const normalized = value?.trim().replace(/\/$/, "") || null;
  setSetting(KEY_BASE, normalized);
}

function sharedMariLogin(): { username: string; password: string } | null {
  const username = getMariRestUsername();
  const password = getMariRestPassword();
  if (!username || !password) return null;
  return { username, password };
}

/**
 * Shared REST login from env. Personalnummer stays per user.
 */
export function resolveMariConfigForUser(
  userId: number | null | undefined
): MariConfig | null {
  const baseUrl = getMariBaseUrl();
  if (!baseUrl) return null;
  if (userId == null || userId <= 0) return null;
  const login = sharedMariLogin();
  if (!login) return null;
  const user = getAppUserById(userId);
  const employeeNumber = user?.mari_employee_number?.trim() || "";
  if (!employeeNumber) return null;
  return {
    baseUrl,
    username: login.username,
    password: login.password,
    employeeNumber,
  };
}

export function resolveMariConfig(): MariConfig | null {
  return resolveMariConfigForUser(getMariRequestUserId());
}

export function getMariSettingsPublic(userId: number | null) {
  const resolved = resolveMariConfigForUser(userId);
  const user = userId ? getAppUserById(userId) : null;
  const login = sharedMariLogin();
  return {
    mariBaseUrl: getMariBaseUrl(),
    mariUsername: login?.username || "",
    hasMariPassword: Boolean(login?.password),
    mariPasswordUnreadable: false,
    mariEmployeeNumber: user?.mari_employee_number?.trim() || "",
    mariConfigured: Boolean(resolved),
    mariSharedLogin: Boolean(login),
  };
}

export function getMariUnconfiguredPublic(userId?: number | null) {
  const pub = getMariSettingsPublic(userId ?? getMariRequestUserId());
  const login = sharedMariLogin();
  return {
    error: !login
      ? "MARI-Zugang fehlt in der Server-Umgebung (MARI_REST_USERNAME / MARI_REST_PASSWORD)."
      : "Personalnummer unter Konto hinterlegen.",
    configured: false as const,
    mariPasswordUnreadable: false,
    mariSharedLogin: Boolean(login),
    mariConfigured: pub.mariConfigured,
  };
}
