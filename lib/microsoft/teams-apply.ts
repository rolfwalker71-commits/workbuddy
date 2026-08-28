import { z } from "zod";
import {
  TeamsAnalysisEventSchema,
  TeamsAnalysisTaskSchema,
} from "@/lib/microsoft/analyze-teams-chat";
import {
  getTeamsThreadState,
  incrementTeamsThreadApplied,
  upsertTeamsThreadState,
  type TeamsThreadKind,
  type TeamsThreadState,
} from "@/lib/microsoft/teams-thread-state";

export const TeamsApplyBodySchema = z.object({
  tasks: z.array(TeamsAnalysisTaskSchema).max(12).optional().default([]),
  events: z.array(TeamsAnalysisEventSchema).max(12).optional().default([]),
  issueId: z.number().int().positive().nullable().optional(),
  threadKey: z.string().trim().min(1).max(400).optional(),
  kind: z.enum(["chat", "channel"]).optional(),
  title: z.string().trim().max(300).nullable().optional(),
});

export type TeamsApplyBody = z.infer<typeof TeamsApplyBodySchema>;

export function inferTeamsThreadKind(
  threadKey: string,
  fallback?: TeamsThreadKind
): TeamsThreadKind {
  if (fallback) return fallback;
  const key = threadKey.trim();
  if (key.startsWith("19:")) return "chat";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(key) && key.includes(":")) {
    return "channel";
  }
  return "chat";
}

/** Outlook To Do / event notes: Quelle Teams + optional #issueId. */
export function buildTeamsApplyNotes(opts: {
  notes?: string | null;
  sourceChatTitle?: string | null;
  issueId?: number | null;
}): string {
  const source = opts.sourceChatTitle?.trim();
  const issueId =
    opts.issueId != null && opts.issueId > 0 ? opts.issueId : null;
  return [
    opts.notes?.trim() || null,
    source ? `Quelle Teams: ${source}` : "Quelle Teams",
    issueId != null ? `#${issueId}` : null,
    "Übernommen aus Teams-Analyse (Buddy)",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function teamsApplyPrimaryConflict(
  tasks: unknown[],
  events: unknown[]
): string | null {
  if (tasks.length > 0 && events.length > 0) {
    return "Eine primäre Aktion: To-do oder Termin, nicht beides.";
  }
  return null;
}

export function teamsApplyHasWork(body: {
  tasks: unknown[];
  events: unknown[];
  issueId?: number | null;
}): boolean {
  return (
    body.tasks.length > 0 ||
    body.events.length > 0 ||
    (body.issueId != null && body.issueId > 0)
  );
}

export function collectTeamsApplyThreadKeys(body: TeamsApplyBody): string[] {
  const keys = new Set<string>();
  const add = (raw?: string | null) => {
    const key = raw?.trim();
    if (key) keys.add(key);
  };
  add(body.threadKey);
  for (const task of body.tasks) add(task.sourceChatId);
  for (const event of body.events) add(event.sourceChatId);
  return [...keys];
}

/**
 * Patch applied_tasks / applied_events and optional issue_id.
 * last_analysis_json is left untouched.
 */
export function recordTeamsApplyOnThread(input: {
  userId: number;
  threadKey: string;
  kind?: TeamsThreadKind;
  title?: string | null;
  issueId?: number | null;
  tasks?: number;
  events?: number;
}): TeamsThreadState | null {
  const threadKey = input.threadKey.trim();
  if (!threadKey) return null;
  const existing = getTeamsThreadState(input.userId, threadKey);
  if (!existing) {
    upsertTeamsThreadState({
      userId: input.userId,
      threadKey,
      kind: inferTeamsThreadKind(threadKey, input.kind),
      title: input.title ?? null,
      issueId: input.issueId ?? null,
    });
  } else if (input.issueId != null) {
    upsertTeamsThreadState({
      userId: input.userId,
      threadKey,
      issueId: input.issueId,
    });
  }
  return incrementTeamsThreadApplied(input.userId, threadKey, {
    tasks: input.tasks,
    events: input.events,
  });
}
