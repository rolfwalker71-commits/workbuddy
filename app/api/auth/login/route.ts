import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthConfiguration } from "@/lib/auth/config";
import {
  verifyConfiguredPassword,
  verifyPasswordHash,
} from "@/lib/auth/password";
import {
  clearLoginFailures,
  loginRateLimitStatus,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";
import {
  createSessionToken,
  readSessionPayload,
  sessionCookieOptions,
  sessionKeyFromToken,
} from "@/lib/auth/session";
import { ALL_APP_MODULES, homePathForModules } from "@/lib/users/modules";
import {
  openActivitySession,
  recordActivity,
} from "@/lib/users/activity-log";
import {
  effectiveUserModules,
  getAppUserByEmail,
  getAppUserByUsername,
} from "@/lib/users/queries";
import { tRequest } from "@/lib/i18n/request-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(1000),
});

function clientAddress(headerStore: Headers): string {
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const config = getAuthConfiguration();
  if (!config.configured) {
    return NextResponse.json(
      {
        error: await tRequest("auth.notConfigured"),
      },
      { status: 503 }
    );
  }

  const headerStore = await headers();
  const address = clientAddress(headerStore);
  const rateLimit = loginRateLimitStatus(address);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: await tRequest("auth.tooManyTries"),
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    recordLoginFailure(address);
    return NextResponse.json(
      { error: await tRequest("auth.badCredentials") },
      { status: 401 }
    );
  }

  const adminValid = await verifyConfiguredPassword(
    parsed.data.username,
    parsed.data.password,
    config
  );

  let token: string | null = null;
  let home = "/";
  let activityUserId: number | null = null;
  let activityUsername = "";

  if (adminValid) {
    const { ensureEnvAdminUser } = await import("@/lib/users/resolve-user");
    await ensureEnvAdminUser();
    token = await createSessionToken(
      { kind: "admin", username: config.username },
      config.sessionSecret
    );
    home = homePathForModules(ALL_APP_MODULES);
    activityUsername = config.username;
    activityUserId = getAppUserByUsername(config.username)?.id ?? null;
  } else {
    const user =
      getAppUserByUsername(parsed.data.username) ||
      getAppUserByEmail(parsed.data.username);
    if (
      user &&
      user.active &&
      (await verifyPasswordHash(parsed.data.password, user.password_hash))
    ) {
      token = await createSessionToken(
        {
          kind: "user",
          username: user.username,
          userId: user.id,
        },
        config.sessionSecret
      );
      home = homePathForModules(
        effectiveUserModules(user.id, Boolean(user.is_admin))
      );
      activityUserId = user.id;
      activityUsername = user.username;
    }
  }

  if (!token) {
    recordLoginFailure(address);
    return NextResponse.json(
      { error: await tRequest("auth.badCredentials") },
      { status: 401 }
    );
  }

  clearLoginFailures(address);
  const { name, ...options } = sessionCookieOptions();
  const cookieStore = await cookies();
  cookieStore.set(name, token, options);

  try {
    recordActivity({
      event: "login",
      userId: activityUserId,
      username: activityUsername,
    });
    const payload = readSessionPayload(token);
    if (payload) {
      openActivitySession({
        sessionKey: sessionKeyFromToken(token),
        expiresAt: payload.expiresAt,
        userId: activityUserId,
        username: activityUsername,
      });
    }
  } catch {
    // Logging must never fail login.
  }

  return NextResponse.json({ ok: true, home });
}
