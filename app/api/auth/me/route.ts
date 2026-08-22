import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/current-user";
import { ALL_APP_MODULES } from "@/lib/users/modules";
import { userAvatarPublicUrl } from "@/lib/users/avatar";
import {
  effectiveUserModules,
  getAppUserById,
  getAppUserByUsername,
} from "@/lib/users/queries";

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
    return NextResponse.json({
      kind: "admin",
      username: ctx.username,
      displayName: linked?.display_name || ctx.username,
      isAdmin: true,
      avatarUrl: linked ? userAvatarPublicUrl(linked.avatar_path) : null,
      userId: linked?.id ?? ctx.userId,
      modules: [...ALL_APP_MODULES],
    });
  }
  const user = ctx.userId ? getAppUserById(ctx.userId) : null;
  if (!user) {
    return NextResponse.json(
      { error: "Anmeldung erforderlich." },
      { status: 401 }
    );
  }
  const isAdmin = Boolean(user.is_admin);
  return NextResponse.json({
    kind: "user",
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    userId: user.id,
    gender: user.gender,
    avatarUrl: userAvatarPublicUrl(user.avatar_path),
    isAdmin,
    modules: effectiveUserModules(user.id, isAdmin),
    mariEmployeeNumber: user.mari_employee_number,
    hasOpenaiKey: Boolean(user.openai_api_key_enc),
    hasMariPassword: Boolean(user.mari_rest_password_enc),
  });
}
