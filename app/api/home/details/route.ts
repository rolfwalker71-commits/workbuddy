import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAuth,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getHomeDetails } from "@/lib/dashboard/home-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return runWithRequestSecrets(auth, async () => {
    const payload = await getHomeDetails(auth);
    return NextResponse.json(payload);
  });
}
