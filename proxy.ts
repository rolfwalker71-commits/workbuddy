import { NextRequest, NextResponse } from "next/server";
import {
  getAuthConfiguration,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";
import {
  effectiveUserModules,
  getAppUserById,
} from "@/lib/users/queries";
import {
  ALL_APP_MODULES,
  homePathForModules,
  type AppModule,
} from "@/lib/users/modules";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/microsoft/start",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/workbuddy-logo.svg",
  "/ang-logo.png",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname === "/api/microsoft/oauth/callback") return true;
  if (pathname === "/api/google/oauth/callback") return true;
  if (pathname === "/api/push/media" || pathname.startsWith("/api/push/media/")) {
    return true;
  }
  return false;
}

function isAlwaysAllowedForLimitedUser(pathname: string): boolean {
  if (pathname === "/api/auth/me" || pathname === "/api/auth/logout") {
    return true;
  }
  if (pathname.startsWith("/api/push/")) return true;
  if (pathname === "/api/me" || pathname.startsWith("/api/me/")) {
    return true;
  }
  if (pathname === "/account" || pathname.startsWith("/account/")) return true;
  if (pathname.startsWith("/api/users/media/avatar/")) return true;
  if (pathname === "/api/account" || pathname.startsWith("/api/account/")) {
    return true;
  }
  if (pathname === "/" || pathname === "/api/home/overview") {
    return true;
  }
  if (pathname.startsWith("/api/home/")) return true;
  if (pathname === "/api/dashboard/day-close") return true;
  if (
    pathname === "/api/microsoft/connection" ||
    pathname.startsWith("/api/microsoft/oauth/") ||
    pathname === "/api/microsoft/probe" ||
    pathname === "/api/microsoft/calendars" ||
    pathname === "/api/microsoft/mail/signature"
  ) {
    return true;
  }
  if (
    pathname === "/api/google/connection" ||
    pathname.startsWith("/api/google/oauth/") ||
    pathname === "/api/google/calendars"
  ) {
    return true;
  }
  return false;
}

function isModulePathAllowed(
  pathname: string,
  modules: readonly AppModule[]
): boolean {
  if (modules.includes("microsoft")) {
    if (pathname === "/microsoft" || pathname.startsWith("/microsoft/")) {
      return true;
    }
    if (
      pathname.startsWith("/api/microsoft/") &&
      pathname !== "/api/microsoft/settings" &&
      !pathname.startsWith("/api/microsoft/settings/")
    ) {
      return true;
    }
    if (pathname === "/api/calendar/adhoc" || pathname === "/api/calendar/range") {
      return true;
    }
  }
  if (modules.includes("google")) {
    if (pathname === "/google" || pathname.startsWith("/google/")) {
      return true;
    }
    if (pathname.startsWith("/api/google/")) {
      return true;
    }
    if (pathname === "/api/calendar/adhoc" || pathname === "/api/calendar/range") {
      return true;
    }
  }
  if (modules.includes("maringo")) {
    if (pathname === "/maringo" || pathname.startsWith("/maringo/")) {
      return true;
    }
    if (pathname.startsWith("/api/maringo/")) return true;
    if (pathname === "/api/calendar/adhoc") return true;
  }
  return false;
}

function isLimitedUserAllowedPath(
  pathname: string,
  modules: readonly AppModule[]
): boolean {
  if (isAlwaysAllowedForLimitedUser(pathname)) return true;
  return isModulePathAllowed(pathname, modules);
}

function normalizeHost(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.endsWith(":443") || h.endsWith(":80")) {
    return h.replace(/:(443|80)$/, "");
  }
  return h;
}

function expectedRequestHost(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  return normalizeHost(
    forwardedHost?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      request.nextUrl.host
  );
}

function hasValidOrigin(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const expectedHost = expectedRequestHost(request);

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return normalizeHost(new URL(origin).host) === expectedHost;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return normalizeHost(new URL(referer).host) === expectedHost;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") {
    return true;
  }

  return false;
}

function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const proto =
    forwardedProto ||
    (request.nextUrl.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

function isLimitedAppUser(session: {
  kind: string;
  userId?: number;
}): boolean {
  if (session.kind !== "user") return false;
  if (!session.userId) return true;
  const user = getAppUserById(session.userId);
  return !user?.active || !user.is_admin;
}

function limitedUserHome(session: {
  kind: string;
  userId?: number;
}): string {
  if (session.kind === "user" && session.userId) {
    const user = getAppUserById(session.userId);
    if (user?.is_admin) return homePathForModules(ALL_APP_MODULES);
    if (user) {
      return homePathForModules(effectiveUserModules(user.id, false));
    }
  }
  return "/account";
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const origin = requestOrigin(request);

  if (
    pathname.startsWith("/api/") &&
    !isPublicPath(pathname) &&
    !hasValidOrigin(request)
  ) {
    return NextResponse.json(
      { error: "Ungültige Request-Herkunft." },
      { status: 403 }
    );
  }

  if (isPublicPath(pathname) && pathname !== "/login") {
    return NextResponse.next();
  }

  const auth = getAuthConfiguration();
  let session = null;
  try {
    session = auth.configured
      ? await verifySessionToken(
          request.cookies.get(SESSION_COOKIE_NAME)?.value,
          auth.sessionSecret
        )
      : null;
  } catch (error) {
    console.error("[workbuddy] Session verification failed:", error);
  }

  if (session?.kind === "admin" && session.username !== auth.username) {
    session = null;
  }

  if (session) {
    if (pathname === "/login") {
      let home = "/";
      if (session.kind === "user" && session.userId) {
        home = limitedUserHome(session);
      }
      return NextResponse.redirect(new URL(home, origin));
    }
    if (isLimitedAppUser(session)) {
      const modules =
        session.userId != null
          ? effectiveUserModules(session.userId, false)
          : [];
      if (!isLimitedUserAllowedPath(pathname, modules)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Keine Berechtigung." },
            { status: 403 }
          );
        }
        return NextResponse.redirect(
          new URL(homePathForModules(modules), origin)
        );
      }
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: auth.configured
          ? "Anmeldung erforderlich."
          : "Die Server-Anmeldung ist nicht konfiguriert.",
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", origin);
  const next = `${pathname}${search}`;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|robots.txt|sitemap.xml|.*\\.(?:svg|png|webp|jpg|jpeg|gif)$).*)",
  ],
};
