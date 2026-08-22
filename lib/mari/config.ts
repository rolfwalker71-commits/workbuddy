import {
  resolveMariConfig,
  resolveMariConfigForUser,
} from "@/lib/mari/settings";

export type MariConfig = {
  baseUrl: string;
  username: string;
  password: string;
  employeeNumber: string;
};

/** Per-user Konto credentials only. No Einstellungen / .env login fallback. */
export function getMariConfig(userId?: number | null): MariConfig | null {
  if (userId !== undefined) {
    return resolveMariConfigForUser(userId);
  }
  return resolveMariConfig();
}

export function hasMariConfig(userId?: number | null): boolean {
  return getMariConfig(userId) != null;
}
