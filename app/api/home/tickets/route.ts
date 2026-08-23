import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAuth,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getMariTicketsWatchStateLive } from "@/lib/mari/sync-tickets-if-due";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!auth.modules.includes("maringo")) {
    return NextResponse.json({ tickets: null });
  }
  return runWithRequestSecrets(auth, async () => {
    const userId = resolveAppUserId(auth);
    const ownerKey = userId != null ? `user:${userId}` : ownerKeyFromAuth(auth);
    const tickets = await getMariTicketsWatchStateLive(ownerKey);
    return NextResponse.json({ tickets });
  });
}
