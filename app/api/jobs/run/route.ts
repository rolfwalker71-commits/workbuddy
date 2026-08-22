import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { rescheduleFromNow } from "@/lib/jobs/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  rescheduleFromNow();
  return NextResponse.json({ ok: true });
}
