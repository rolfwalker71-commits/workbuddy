import { NextResponse } from "next/server";
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Microsoft 365 is a post-login connect, not a sign-in method. */
export async function GET(request: Request) {
  const loginUrl = absoluteAppUrl("/login", request);
  return NextResponse.redirect(
    `${loginUrl}?error=${encodeURIComponent(
      "Bitte mit Benutzername und Passwort anmelden. Ein Admin legt das Konto an; Microsoft 365 verbindest du danach unter Konto."
    )}`
  );
}
