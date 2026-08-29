import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  asTeamsAnalysis,
  countTeamsThreadsByInbox,
  getTeamsThreadState,
  listTeamsThreadStates,
  parseTeamsInboxState,
  upsertTeamsThreadState,
  type TeamsInboxState,
} from "@/lib/microsoft/teams-thread-state";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { requireTeamsFeature } from "@/lib/microsoft/teams-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBodySchema = z.object({
  threadKey: z.string().trim().min(1).max(400),
  kind: z.enum(["chat", "channel"]).optional(),
  inbox: z.enum(["open", "later", "done", "ignored"]).optional(),
  title: z.string().trim().max(300).nullable().optional(),
  preview: z.string().trim().max(500).nullable().optional(),
  lastActiveAt: z.string().trim().max(64).nullable().optional(),
  joinUrl: z.string().trim().max(2000).nullable().optional(),
  calendarEventId: z.string().trim().max(400).nullable().optional(),
  issueId: z.number().int().positive().nullable().optional(),
  appliedTasks: z.number().int().min(0).max(999).optional(),
  appliedEvents: z.number().int().min(0).max(999).optional(),
  lastAnalysis: z.unknown().optional(),
});

function teamsThreadAuth() {
  return requireModule("microsoft").then((auth) => {
    if (isAuthError(auth)) return { error: auth as NextResponse };
    const userId = resolveMicrosoftUserId(auth);
    const denied = requireTeamsFeature(userId);
    if (denied) return { error: denied };
    if (userId == null || !isMicrosoftConnected(userId)) {
      return {
        error: NextResponse.json(
          { error: "Microsoft 365 nicht verbunden." },
          { status: 400 }
        ),
      };
    }
    return { userId };
  });
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await teamsThreadAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;
  const url = new URL(request.url);
  const threadKey = url.searchParams.get("threadKey")?.trim() || "";
  if (threadKey) {
    const thread = getTeamsThreadState(userId, threadKey);
    return NextResponse.json({ ok: true, thread });
  }
  const inboxRaw = url.searchParams.getAll("inbox");
  const inbox = inboxRaw
    .flatMap((v) => v.split(","))
    .map((v) => parseTeamsInboxState(v.trim()))
    .filter((v): v is TeamsInboxState => v != null);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const threads = listTeamsThreadStates(userId, {
    inbox: inbox.length > 0 ? inbox : undefined,
    q,
  });
  return NextResponse.json({
    ok: true,
    threads,
    openCount: countTeamsThreadsByInbox(userId, "open"),
  });
}

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await teamsThreadAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  let body: z.infer<typeof PatchBodySchema>;
  try {
    body = PatchBodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  const hasInbox = body.inbox != null;
  const hasMeta =
    body.kind != null ||
    body.title !== undefined ||
    body.preview !== undefined ||
    body.lastActiveAt !== undefined ||
    body.joinUrl !== undefined ||
    body.calendarEventId !== undefined ||
    body.issueId !== undefined ||
    body.appliedTasks !== undefined ||
    body.appliedEvents !== undefined ||
    body.lastAnalysis !== undefined;
  if (!hasInbox && !hasMeta) {
    return NextResponse.json(
      { error: "inbox oder Metadaten nötig." },
      { status: 400 }
    );
  }

  let lastAnalysis = undefined as
    | ReturnType<typeof asTeamsAnalysis>
    | undefined;
  if (body.lastAnalysis !== undefined) {
    if (body.lastAnalysis == null) {
      lastAnalysis = null;
    } else {
      lastAnalysis = asTeamsAnalysis(body.lastAnalysis);
      if (!lastAnalysis) {
        return NextResponse.json(
          { error: "lastAnalysis ungültig." },
          { status: 400 }
        );
      }
    }
  }

  const thread = upsertTeamsThreadState({
    userId,
    threadKey: body.threadKey,
    kind: body.kind,
    inbox: body.inbox,
    title: body.title,
    preview: body.preview,
    lastActiveAt: body.lastActiveAt,
    joinUrl: body.joinUrl,
    calendarEventId: body.calendarEventId,
    issueId: body.issueId,
    appliedTasks: body.appliedTasks,
    appliedEvents: body.appliedEvents,
    lastAnalysis,
  });

  return NextResponse.json({ ok: true, thread });
}
