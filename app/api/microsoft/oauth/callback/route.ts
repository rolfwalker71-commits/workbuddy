import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { getAuthConfiguration } from "@/lib/auth/config";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { homePathForModules } from "@/lib/users/modules";
import { effectiveUserModules } from "@/lib/users/queries";
import {
  consumeMicrosoftOauthLoginState,
  consumeMicrosoftOauthState,
  finishMicrosoftLogin,
  finishMicrosoftOauth,
  parseMicrosoftOauthState,
} from "@/lib/microsoft/oauth";
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");

  const accountUrl = absoluteAppUrl("/account", request);
  const loginUrl = absoluteAppUrl("/login", request);

  const state = parseMicrosoftOauthState(stateRaw);
  const isLogin = state?.purpose === "login";

  function failRedirect(reason: string) {
    if (isLogin) {
      return NextResponse.redirect(
        `${loginUrl}?error=${encodeURIComponent(reason.slice(0, 200))}`
      );
    }
    return NextResponse.redirect(
      `${accountUrl}?microsoft=error&reason=${encodeURIComponent(reason.slice(0, 200))}`
    );
  }

  if (error) {
    const reason = errorDescription || error;
    return failRedirect(reason);
  }
  if (!code) {
    return failRedirect("code_missing");
  }
  if (!state) {
    return failRedirect("invalid_state");
  }

  if (state.purpose === "login") {
    const consumed = consumeMicrosoftOauthLoginState(state.nonce);
    if (!consumed) {
      return failRedirect("invalid_state");
    }
    const config = getAuthConfiguration();
    if (!config.configured) {
      return failRedirect("Die Anmeldung ist auf dem Server nicht konfiguriert.");
    }
    try {
      const { user } = await finishMicrosoftLogin(code, request);
      const token = await createSessionToken(
        {
          kind: "user",
          username: user.username,
          userId: user.id,
        },
        config.sessionSecret
      );
      const { name, ...options } = sessionCookieOptions();
      const cookieStore = await cookies();
      cookieStore.set(name, token, options);
      const home = homePathForModules(
        effectiveUserModules(user.id, Boolean(user.is_admin))
      );
      const target =
        consumed.next && consumed.next !== "/login" ? consumed.next : home;
      return NextResponse.redirect(absoluteAppUrl(target, request));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return failRedirect(msg);
    }
  }

  if (!consumeMicrosoftOauthState(state.userId, state.nonce)) {
    return failRedirect("invalid_state");
  }

  try {
    await finishMicrosoftOauth(state.userId, code, request);
    return NextResponse.redirect(`${accountUrl}?microsoft=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failRedirect(msg);
  }
}
