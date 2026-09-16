import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { countUnreadNotifications } from "@/lib/notifications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Separat vom Listen-Endpoint, weil die Glocke das häufig und billig braucht. */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    unread: countUnreadNotifications(ownerKeyFromAuth(auth)),
  });
}
