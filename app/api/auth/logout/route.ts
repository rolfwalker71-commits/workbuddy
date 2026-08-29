import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/current-user";
import {
  sessionCookieOptions,
  sessionKeyFromToken,
} from "@/lib/auth/session";
import {
  closeActivitySession,
  recordActivity,
} from "@/lib/users/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const { name, ...options } = sessionCookieOptions();
  const token = cookieStore.get(name)?.value ?? "";

  try {
    const ctx = await getAuthContext();
    const sessionKey = token ? sessionKeyFromToken(token) : "";
    if (sessionKey) {
      closeActivitySession({ sessionKey });
    }
    if (ctx) {
      recordActivity({
        event: "logout",
        userId: ctx.userId,
        username: ctx.username,
      });
    }
  } catch {
    // Logging must never fail logout.
  }

  cookieStore.set(name, "", { ...options, maxAge: 0 });
  return NextResponse.json({ ok: true });
}
