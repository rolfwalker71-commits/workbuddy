import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { getSchedulerRuntimeStatus } from "@/lib/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json(getSchedulerRuntimeStatus());
}
