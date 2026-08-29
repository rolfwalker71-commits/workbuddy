import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { getAppUserById } from "@/lib/users/queries";

/** Admin switch in `settings`. Missing = on (current behavior). */
export const TEAMS_MODULE_ENABLED_KEY = "teams_module_enabled";

/** Missing / unknown values stay on so current Microsoft users keep Teams. */
export function parseTeamsEnabled(raw: unknown): boolean {
  if (raw === 0 || raw === false || raw === "0") return false;
  if (typeof raw === "string" && raw.toLowerCase() === "false") return false;
  return true;
}

export function isTeamsModuleEnabled(): boolean {
  return parseTeamsEnabled(getSetting(TEAMS_MODULE_ENABLED_KEY));
}

export function setTeamsModuleEnabled(enabled: boolean): void {
  setSetting(TEAMS_MODULE_ENABLED_KEY, enabled ? "1" : "0");
}

export function isUserTeamsEnabled(userId: number | null | undefined): boolean {
  if (userId == null) return true;
  const row = getAppUserById(userId);
  return parseTeamsEnabled(row?.teams_enabled);
}

/** Teams UI and chat APIs: admin module switch AND per-user toggle. */
export function isTeamsEnabledForUser(
  userId: number | null | undefined
): boolean {
  return isTeamsModuleEnabled() && isUserTeamsEnabled(userId);
}

export function teamsPreferenceOffResponse(): NextResponse {
  const adminOff = !isTeamsModuleEnabled();
  return NextResponse.json(
    {
      error: adminOff
        ? "Teams ist vom Admin ausgeschaltet."
        : "Teams ist unter Konto ausgeschaltet.",
      teamsDisabled: true,
      teamsModuleDisabled: adminOff,
    },
    { status: 403 }
  );
}

export function requireTeamsFeature(
  userId: number | null | undefined
): NextResponse | null {
  if (!isTeamsEnabledForUser(userId)) return teamsPreferenceOffResponse();
  return null;
}
