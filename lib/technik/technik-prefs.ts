import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { parseTeamsEnabled } from "@/lib/microsoft/teams-prefs";

/** Missing = on, same as Teams. */
export function technikNavSettingKey(userId: number): string {
  return `technik_nav_enabled_${userId}`;
}

export function isTechnikNavEnabled(
  userId: number | null | undefined
): boolean {
  if (userId == null || !Number.isInteger(userId) || userId <= 0) return true;
  return parseTeamsEnabled(getSetting(technikNavSettingKey(userId)));
}

export function setTechnikNavEnabled(userId: number, enabled: boolean): void {
  setSetting(technikNavSettingKey(userId), enabled ? "1" : "0");
}

export function technikPreferenceOffResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Technik ist unter Konto ausgeblendet.",
      technikDisabled: true,
    },
    { status: 403 }
  );
}

export function requireTechnikNav(
  userId: number | null | undefined
): NextResponse | null {
  if (!isTechnikNavEnabled(userId)) return technikPreferenceOffResponse();
  return null;
}
