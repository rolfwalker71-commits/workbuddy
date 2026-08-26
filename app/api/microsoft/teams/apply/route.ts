import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  TeamsAnalysisEventSchema,
  TeamsAnalysisTaskSchema,
} from "@/lib/microsoft/analyze-teams-chat";
import {
  createOutlookCalendarEvent,
  createOutlookTodoTask,
} from "@/lib/microsoft/mail-day-actions";
import {
  hasMicrosoftTasksScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tasks: z.array(TeamsAnalysisTaskSchema).max(12).optional().default([]),
  events: z.array(TeamsAnalysisEventSchema).max(12).optional().default([]),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  if (body.tasks.length === 0 && body.events.length === 0) {
    return NextResponse.json(
      { error: "Keine Auswahl zum Übernehmen." },
      { status: 400 }
    );
  }

  if (body.tasks.length > 0 && !hasMicrosoftTasksScope(userId)) {
    return NextResponse.json(
      {
        error:
          "Microsoft To Do-Recht fehlt. Bitte unter Konto Microsoft 365 neu verbinden (Tasks.ReadWrite).",
      },
      { status: 403 }
    );
  }

  const created: Array<{
    title: string;
    ok: boolean;
    kind: "task" | "event";
    target: string;
    link?: string | null;
    error?: string;
  }> = [];

  for (const task of body.tasks) {
    const source = task.sourceChatTitle?.trim();
    const notes = [
      task.notes?.trim() || null,
      source ? `Quelle Teams: ${source}` : null,
      "Übernommen aus Teams-Analyse (Buddy)",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const t = await createOutlookTodoTask(userId, {
        title: task.title,
        notes,
        dueDate: task.dueDate,
      });
      created.push({
        title: t.title,
        ok: true,
        kind: "task",
        target: "outlook_todo",
        link: t.webLink,
      });
    } catch (error) {
      created.push({
        title: task.title,
        ok: false,
        kind: "task",
        target: "outlook_todo",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const event of body.events) {
    const source = event.sourceChatTitle?.trim();
    const notes = [
      event.notes?.trim() || null,
      source ? `Quelle Teams: ${source}` : null,
      "Übernommen aus Teams-Analyse (Buddy)",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const ev = await createOutlookCalendarEvent(userId, {
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        location: event.location,
        notes,
      });
      created.push({
        title: ev.subject,
        ok: true,
        kind: "event",
        target: "outlook_event",
        link: ev.webLink,
      });
    } catch (error) {
      created.push({
        title: event.title,
        ok: false,
        kind: "event",
        target: "outlook_event",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = created.filter((c) => !c.ok);
  return NextResponse.json({
    ok: created.some((c) => c.ok),
    created,
    okCount: created.filter((c) => c.ok).length,
    failCount: failed.length,
    errors: failed.map((f) => f.error).filter(Boolean),
    taskOk: created.filter((c) => c.kind === "task" && c.ok).length,
    eventOk: created.filter((c) => c.kind === "event" && c.ok).length,
  });
}
