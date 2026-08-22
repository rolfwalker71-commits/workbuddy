import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAuth,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getHomeOverview } from "@/lib/dashboard/home-overview";
import { getAppUserById, getAppUserByUsername } from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  return runWithRequestSecrets(auth, async () => {
    const user = auth.userId
      ? getAppUserById(auth.userId)
      : getAppUserByUsername(auth.username);
    const payload = await getHomeOverview(auth);
    return NextResponse.json({
      ...payload,
      greetingName: user?.display_name || auth.username,
    });
  });
}
