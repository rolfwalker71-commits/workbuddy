import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listGmailMessages } from "@/lib/google/gmail-messages";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { syncGoogleMailAnalysesForItems } from "@/lib/google/sync-mail-analysis";
import {
  countPendingMailTriage,
  getMailAnalysis,
  listPendingMailTriage,
  updateMailAnalysisStatus,
} from "@/lib/mail/mail-analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("google");
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json({ pending: [], pendingCount: 0 });
  }
  const sync = new URL(request.url).searchParams.get("sync") !== "0";
  if (sync) {
    try {
      const items = await listGmailMessages(userId, {
        filter: "today",
        limit: 30,
        request,
      });
      await syncGoogleMailAnalysesForItems(userId, items, {
        maxAi: 3,
        request,
      });
    } catch {
      /* list pending even if sync fails */
    }
  }
  const pending = listPendingMailTriage(userId, 40, "google");
  return NextResponse.json({
    pending,
    pendingCount: countPendingMailTriage(userId, "google"),
  });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("google");
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
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
  const existing = getMailAnalysis(userId, messageId, "google");
  if (!existing) {
    return NextResponse.json(
      { error: "Analyse nicht gefunden" },
      { status: 404 }
    );
  }
  const status = body?.action === "applied" ? "applied" : "dismissed";
  updateMailAnalysisStatus(userId, messageId, status, "google");
  if (status === "dismissed") {
    const { recordMailSenderDismissed } = await import(
      "@/lib/mail/mail-sender-prefs"
    );
    recordMailSenderDismissed(userId, existing.fromEmail);
  }
  return NextResponse.json({ ok: true, status });
}
