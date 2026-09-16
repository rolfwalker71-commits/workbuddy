import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import {
  countUnreadNotifications,
  listNotifications,
} from "@/lib/notifications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 30;
  const before = url.searchParams.get("before");

  const ownerKey = ownerKeyFromAuth(auth);
  const { items, hasMore } = listNotifications(ownerKey, { limit, before });
  return NextResponse.json({
    items,
    hasMore,
    unread: countUnreadNotifications(ownerKey),
  });
}
