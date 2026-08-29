import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  appendMariBodyMarker,
  mariOutlookCategories,
  upsertMariCalendarStamp,
} from "@/lib/mari/calendar-stamp";
import {
  buildTeamsApplyNotes,
  collectTeamsApplyThreadKeys,
  recordTeamsApplyOnThread,
  TeamsApplyBodySchema,
  teamsApplyHasWork,
  teamsApplyPrimaryConflict,
} from "@/lib/microsoft/teams-apply";
import {
  createOutlookCalendarEvent,
  createOutlookTodoTask,
} from "@/lib/microsoft/mail-day-actions";
import {
  hasMicrosoftTasksScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { requireTeamsFeature } from "@/lib/microsoft/teams-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const denied = requireTeamsFeature(userId);
  if (denied) return denied;
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof TeamsApplyBodySchema>;
  try {
    body = TeamsApplyBodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  const primaryError = teamsApplyPrimaryConflict(body.tasks, body.events);
  if (primaryError) {
    return NextResponse.json({ error: primaryError }, { status: 400 });
  }

  if (!teamsApplyHasWork(body)) {
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

  const issueId =
    body.issueId != null && body.issueId > 0 ? body.issueId : null;

  const created: Array<{
    title: string;
    ok: boolean;
    kind: "task" | "event";
    target: string;
    threadKey?: string | null;
    link?: string | null;
    error?: string;
  }> = [];

  for (const task of body.tasks) {
    const notes = buildTeamsApplyNotes({
      notes: task.notes,
      sourceChatTitle: task.sourceChatTitle,
      issueId,
    });
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
        threadKey: task.sourceChatId || body.threadKey || null,
        link: t.webLink,
      });
    } catch (error) {
      created.push({
        title: task.title,
        ok: false,
        kind: "task",
        target: "outlook_todo",
        threadKey: task.sourceChatId || body.threadKey || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const event of body.events) {
    const rawNotes = event.notes?.trim() || null;
    const notes = buildTeamsApplyNotes({
      notes: rawNotes,
      sourceChatTitle: event.sourceChatTitle,
      issueId,
    });
    const allDay = event.allDay ?? !event.startTime;
    try {
      const ev = await createOutlookCalendarEvent(userId, {
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay,
        location: event.location,
        notes: issueId ? appendMariBodyMarker(notes, issueId) : notes,
        categories: issueId ? mariOutlookCategories(issueId) : null,
      });
      if (issueId) {
        upsertMariCalendarStamp({
          userId,
          eventProvider: "microsoft",
          eventId: ev.id,
          issueId,
          eventDate: event.date,
          startHm: allDay ? null : event.startTime,
          endHm: allDay ? null : event.endTime,
          title: event.title,
          memo: rawNotes,
        });
      }
      created.push({
        title: ev.subject,
        ok: true,
        kind: "event",
        target: "outlook_event",
        threadKey: event.sourceChatId || body.threadKey || null,
        link: ev.webLink,
      });
    } catch (error) {
      created.push({
        title: event.title,
        ok: false,
        kind: "event",
        target: "outlook_event",
        threadKey: event.sourceChatId || body.threadKey || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const taskOkByKey = new Map<string, number>();
  const eventOkByKey = new Map<string, number>();
  for (const item of created) {
    if (!item.ok || !item.threadKey?.trim()) continue;
    const key = item.threadKey.trim();
    if (item.kind === "task") {
      taskOkByKey.set(key, (taskOkByKey.get(key) || 0) + 1);
    } else {
      eventOkByKey.set(key, (eventOkByKey.get(key) || 0) + 1);
    }
  }

  const threadKeys = collectTeamsApplyThreadKeys(body);
  let lastThread = null;
  for (const threadKey of threadKeys) {
    lastThread = recordTeamsApplyOnThread({
      userId,
      threadKey,
      kind: body.kind,
      title:
        body.title ||
        body.tasks.find((t) => t.sourceChatId === threadKey)?.sourceChatTitle ||
        body.events.find((e) => e.sourceChatId === threadKey)
          ?.sourceChatTitle ||
        null,
      issueId,
      tasks: taskOkByKey.get(threadKey) || 0,
      events: eventOkByKey.get(threadKey) || 0,
    });
  }

  const failed = created.filter((c) => !c.ok);
  const taskOk = created.filter((c) => c.kind === "task" && c.ok).length;
  const eventOk = created.filter((c) => c.kind === "event" && c.ok).length;
  const ok =
    created.some((c) => c.ok) || (issueId != null && threadKeys.length > 0);

  return NextResponse.json({
    ok,
    created,
    okCount: created.filter((c) => c.ok).length,
    failCount: failed.length,
    errors: failed.map((f) => f.error).filter(Boolean),
    taskOk,
    eventOk,
    issueId,
    thread: lastThread,
  });
}
