import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/current-user";
import { ALL_APP_MODULES } from "@/lib/users/modules";
import { userAvatarPublicUrl } from "@/lib/users/avatar";
import { ensureMicrosoftAvatar } from "@/lib/microsoft/photo";
import {
  effectiveUserModules,
  getAppUserById,
  getAppUserByUsername,
} from "@/lib/users/queries";
import { parseTeamsEnabled } from "@/lib/microsoft/teams-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Anmeldung erforderlich." },
      { status: 401 }
    );
  }
  if (ctx.kind === "admin") {
    const linked = getAppUserByUsername(ctx.username);
    if (linked) await ensureMicrosoftAvatar(linked.id);
    const fresh = linked ? getAppUserByUsername(ctx.username) : null;
    return NextResponse.json({
      kind: "admin",
      username: ctx.username,
      displayName: fresh?.display_name || ctx.username,
      isAdmin: true,
      avatarUrl: fresh ? userAvatarPublicUrl(fresh.avatar_path) : null,
      userId: fresh?.id ?? ctx.userId,
      modules: [...ALL_APP_MODULES],
      teamsEnabled: parseTeamsEnabled(fresh?.teams_enabled),
    });
  }
  const user = ctx.userId ? getAppUserById(ctx.userId) : null;
  if (!user) {
    return NextResponse.json(
      { error: "Anmeldung erforderlich." },
      { status: 401 }
    );
  }
  await ensureMicrosoftAvatar(user.id);
  const fresh = getAppUserById(user.id) ?? user;
  const isAdmin = Boolean(fresh.is_admin);
  return NextResponse.json({
    kind: "user",
    username: fresh.username,
    displayName: fresh.display_name,
    email: fresh.email,
    userId: fresh.id,
    gender: fresh.gender,
    avatarUrl: userAvatarPublicUrl(fresh.avatar_path),
    isAdmin,
    modules: effectiveUserModules(fresh.id, isAdmin),
    teamsEnabled: parseTeamsEnabled(fresh.teams_enabled),
    mariEmployeeNumber: fresh.mari_employee_number,
    hasOpenaiKey: Boolean(fresh.openai_api_key_enc),
    hasMariPassword: Boolean(fresh.mari_rest_password_enc),
  });
}
