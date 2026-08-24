import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  beginMicrosoftOauthLogin,
  isMicrosoftOauthConfigured,
} from "@/lib/microsoft/oauth";
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(request: Request) {
  ensureInitialized();
  const loginUrl = absoluteAppUrl("/login", request);
  if (!isMicrosoftOauthConfigured()) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent(
        "Microsoft-Anmeldung ist auf dem Server nicht konfiguriert."
      )}`
    );
  }
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  try {
    const url = beginMicrosoftOauthLogin(request, next);
    return NextResponse.redirect(url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Microsoft-Anmeldung fehlgeschlagen.";
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent(message.slice(0, 200))}`
    );
  }
}
