import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listTicketPingColleagues } from "@/lib/microsoft/colleagues";
import {
  hasMicrosoftChatCreateScope,
  hasMicrosoftChatMessageSendScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Colleagues resolvable to AAD id/UPN — not gated by teams_module_enabled. */
export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden.", colleagues: [] },
      { status: 400 }
    );
  }
  try {
    const colleagues = await listTicketPingColleagues(userId);
    return NextResponse.json({
      colleagues,
      hasChatCreateScope: hasMicrosoftChatCreateScope(userId),
      hasChatMessageSendScope: hasMicrosoftChatMessageSendScope(userId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kollegen laden fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
