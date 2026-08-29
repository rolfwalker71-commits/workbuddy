import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { listActivity } from "@/lib/users/activity-log";
import { clampActivityLogRange } from "@/lib/users/activity-log-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const range = clampActivityLogRange({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const event = url.searchParams.get("event")?.trim() ?? "";
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 25)
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const result = listActivity({
    from: range.from,
    to: range.to,
    event,
    limit,
    offset,
  });

  return NextResponse.json({ items: result.items, total: result.total });
}
