import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  countPendingMailTriage,
  getMailAnalysis,
  listPendingMailTriage,
  updateMailAnalysisStatus,
} from "@/lib/mail/mail-analysis-store";
import { listMicrosoftInboxMessages } from "@/lib/microsoft/mail-inbox";
import { syncMicrosoftMailAnalysesForItems } from "@/lib/microsoft/sync-mail-analysis";
import {
  hasMicrosoftMailScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
    return NextResponse.json({ pending: [], pendingCount: 0 });
  }
  const sync = new URL(request.url).searchParams.get("sync") !== "0";
  if (sync) {
    try {
      const items = await listMicrosoftInboxMessages(userId, {
        filter: "today",
        limit: 30,
      });
      await syncMicrosoftMailAnalysesForItems(userId, items, { maxAi: 3 });
    } catch {
      /* list pending even if sync fails */
    }
  }
  const pending = listPendingMailTriage(userId, 40, "microsoft");
  return NextResponse.json({
    pending,
    pendingCount: countPendingMailTriage(userId, "microsoft"),
  });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Kein User" }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as {
    messageId?: string;
    action?: "dismiss" | "applied";
  } | null;
  const messageId = body?.messageId?.trim();
  if (!messageId) {
    return NextResponse.json({ error: "messageId fehlt" }, { status: 400 });
  }
  const existing = getMailAnalysis(userId, messageId, "microsoft");
  if (!existing) {
    return NextResponse.json(
      { error: "Analyse nicht gefunden" },
      { status: 404 }
    );
  }
  const status = body?.action === "applied" ? "applied" : "dismissed";
  updateMailAnalysisStatus(userId, messageId, status, "microsoft");
  if (status === "dismissed") {
    const { recordMailSenderDismissed } = await import(
      "@/lib/mail/mail-sender-prefs"
    );
    recordMailSenderDismissed(userId, existing.fromEmail);
  }
  return NextResponse.json({ ok: true, status });
}
