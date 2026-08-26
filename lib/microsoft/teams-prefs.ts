import { NextResponse } from "next/server";
import { getAppUserById } from "@/lib/users/queries";

/** Missing / unknown values stay on so current Microsoft users keep Teams. */
export function parseTeamsEnabled(raw: unknown): boolean {
  if (raw === 0 || raw === false || raw === "0") return false;
  return true;
}

export function isUserTeamsEnabled(userId: number | null | undefined): boolean {
  if (userId == null) return true;
  const row = getAppUserById(userId);
  return parseTeamsEnabled(row?.teams_enabled);
}

export function teamsPreferenceOffResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Teams ist unter Konto ausgeschaltet.",
      teamsDisabled: true,
    },
    { status: 403 }
  );
}
