import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAuth,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { refreshHomeKpis } from "@/lib/dashboard/home-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return runWithRequestSecrets(auth, async () => {
    const kpis = await refreshHomeKpis(auth);
    return NextResponse.json(kpis);
  });
}
