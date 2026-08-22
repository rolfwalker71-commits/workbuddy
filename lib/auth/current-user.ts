import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getAuthConfiguration,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import {
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/session";
import type { AppModule } from "@/lib/users/modules";
import {
  effectiveUserModules,
  getAppUserById,
  getAppUserByUsername,
  userHasModule,
} from "@/lib/users/queries";
import { enterMariRequestUser } from "@/lib/mari/request-context";
import { enterAiRequestUser } from "@/lib/ai/request-context";

export type AuthContext = {
  kind: "admin" | "user";
  username: string;
  userId: number | null;
  isAdmin: boolean;
  modules: AppModule[];
};

function bindRequestSecrets(userId: number | null): void {
  enterMariRequestUser(userId);
  enterAiRequestUser(userId);
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const auth = getAuthConfiguration();
  if (!auth.configured) return null;
  const cookieStore = await cookies();
  return verifySessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
    auth.sessionSecret
  );
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;
  if (session.kind === "admin") {
    const auth = getAuthConfiguration();
    if (session.username !== auth.username) return null;
    const linked = getAppUserByUsername(session.username);
    const ctx: AuthContext = {
      kind: "admin",
      username: session.username,
      userId: linked?.id ?? null,
      isAdmin: true,
      modules: effectiveUserModules(linked?.id ?? 0, true),
    };
    bindRequestSecrets(ctx.userId);
    return ctx;
  }
  if (!session.userId) return null;
  const user = getAppUserById(session.userId);
  if (!user || !user.active) return null;
  if (user.username.toLowerCase() !== session.username.toLowerCase()) {
    return null;
  }
  const isAdmin = Boolean(user.is_admin);
  const ctx: AuthContext = {
    kind: "user",
    username: user.username,
    userId: user.id,
    isAdmin,
    modules: effectiveUserModules(user.id, isAdmin),
  };
  bindRequestSecrets(ctx.userId);
  return ctx;
}

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Anmeldung erforderlich." },
      { status: 401 }
    );
  }
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }
  return ctx;
}

export async function requireModule(
  module: AppModule
): Promise<AuthContext | NextResponse> {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.isAdmin) return ctx;
  if (!ctx.userId || !userHasModule(ctx.userId, module, false)) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }
  return ctx;
}

export function isAuthError(
  value: AuthContext | NextResponse
): value is NextResponse {
  return (
    value instanceof NextResponse ||
    (typeof value === "object" &&
      value !== null &&
      "status" in value &&
      !("isAdmin" in value))
  );
}

export const MISSING_OPENAI_KEY_MESSAGE =
  "Hinterlege deinen OpenAI-Key unter Konto";
