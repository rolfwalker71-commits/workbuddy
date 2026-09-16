import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import {
  countUnreadNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/notifications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  ids: z.array(z.number().int().positive()).max(200).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const parsed = PostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  // Der Store filtert zusätzlich auf owner_key — eine fremde ID trifft nichts.
  const ownerKey = ownerKeyFromAuth(auth);
  const changed = parsed.data.all
    ? markAllNotificationsRead(ownerKey)
    : markNotificationsRead(ownerKey, parsed.data.ids || []);

  return NextResponse.json({
    changed,
    unread: countUnreadNotifications(ownerKey),
  });
}
