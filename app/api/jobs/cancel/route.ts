import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { cancelActiveJobRun } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ ok: cancelActiveJobRun() });
}
