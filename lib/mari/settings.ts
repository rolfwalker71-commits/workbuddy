import { getSetting, setSetting } from "@/lib/db/migrations";
import type { MariConfig } from "@/lib/mari/config";
import { getMariRequestUserId } from "@/lib/mari/request-context";
import {
  getAppUserById,
  getUserMariPassword,
} from "@/lib/users/queries";

const KEY_BASE = "mari_rest_base_url";

export const DEFAULT_MARI_BASE =
  "https://marirestservice.an-group.international";

function envOrNull(key: string): string | null {
  const v = process.env[key]?.trim();
  return v || null;
}

export function getMariBaseUrl(): string {
  return (
    getSetting(KEY_BASE) ||
    envOrNull("MARI_REST_BASE_URL") ||
    DEFAULT_MARI_BASE
  ).replace(/\/$/, "");
}

export function saveMariBaseUrl(value: string | null): void {
  const normalized = value?.trim().replace(/\/$/, "") || null;
  setSetting(KEY_BASE, normalized);
}

/**
 * Per-user MARI login only. No global settings / env username fallback.
 */
export function resolveMariConfigForUser(
  userId: number | null | undefined
): MariConfig | null {
  const baseUrl = getMariBaseUrl();
  if (!baseUrl) return null;
  if (userId == null || userId <= 0) return null;
  const user = getAppUserById(userId);
  const username = user?.mari_rest_username?.trim() || "";
  if (!username) return null;
  const password = getUserMariPassword(user!)?.trim() || "";
  const employeeNumber = user?.mari_employee_number?.trim() || "";
  if (!password || !employeeNumber) return null;
  return { baseUrl, username, password, employeeNumber };
}

export function resolveMariConfig(): MariConfig | null {
  return resolveMariConfigForUser(getMariRequestUserId());
}

export function getMariSettingsPublic(userId: number | null) {
  const resolved = resolveMariConfigForUser(userId);
  const user = userId ? getAppUserById(userId) : null;
  return {
    mariBaseUrl: getMariBaseUrl(),
    mariUsername: user?.mari_rest_username?.trim() || "",
    hasMariPassword: Boolean(resolved || user?.mari_rest_password_enc),
    mariEmployeeNumber: user?.mari_employee_number?.trim() || "",
    mariConfigured: Boolean(resolved),
  };
}
