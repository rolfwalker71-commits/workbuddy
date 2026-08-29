import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { withTimeout } from "@/lib/dashboard/with-timeout";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  listLocalTicketPingColleagues,
  listTicketPingColleagues,
  TICKET_PING_LIST_TIMEOUT_MS,
} from "@/lib/microsoft/colleagues";
import {
  hasMicrosoftChatCreateScope,
  hasMicrosoftChatMessageSendScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function scopesPayload(userId: number) {
  return {
    hasChatCreateScope: hasMicrosoftChatCreateScope(userId),
    hasChatMessageSendScope: hasMicrosoftChatMessageSendScope(userId),
  };
}

/** Colleagues resolvable to AAD id/UPN — not gated by teams_module_enabled. */
export async function GET(request: Request) {
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
  const enrich =
    new URL(request.url).searchParams.get("enrich") === "1";
  try {
    const colleagues = enrich
      ? await withTimeout(
          listTicketPingColleagues(userId, { enrich: true }),
          TICKET_PING_LIST_TIMEOUT_MS,
          listLocalTicketPingColleagues(userId)
        )
      : listLocalTicketPingColleagues(userId);
    return NextResponse.json({
      colleagues,
      ...scopesPayload(userId),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Kollegen laden fehlgeschlagen.";
    const local = listLocalTicketPingColleagues(userId);
    if (local.length > 0) {
      return NextResponse.json({
        colleagues: local,
        warning: message,
        ...scopesPayload(userId),
      });
    }
    return NextResponse.json(
      {
        error:
          /timeout|aborted|zeit/i.test(message)
            ? "Kollegen laden hat zu lange gedauert. Bitte Microsoft 365 prüfen oder später erneut versuchen."
            : message,
        colleagues: [],
      },
      { status: 502 }
    );
  }
}
