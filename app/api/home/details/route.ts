import { NextResponse } from "next/server";
import {
  isAuthError,
  requireAuth,
  runWithRequestSecrets,
} from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getHomeDetails } from "@/lib/dashboard/home-overview";
import {
  getCachedDayView,
  setCachedDayView,
} from "@/lib/microsoft/day-view-cache";
import { resolveAppUserId } from "@/lib/users/resolve-user";
import { zurichYmd } from "@/lib/microsoft/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type HomeDetailsPayload = Awaited<ReturnType<typeof getHomeDetails>>;

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // The most expensive call on the home page: calendar, mail, Planner, To Do,
  // Teams and Maringo, all through the 2-wide Graph gate. Writers invalidate.
  const userId = resolveAppUserId(auth);
  const day = zurichYmd();
  if (userId != null) {
    const cached = getCachedDayView<HomeDetailsPayload>("home", userId, day);
    if (cached) return NextResponse.json(cached);
  }

  return runWithRequestSecrets(auth, async () => {
    const payload = await getHomeDetails(auth);
    if (userId != null) setCachedDayView("home", userId, day, payload);
    return NextResponse.json(payload);
  });
}
