import { graphFetch, graphJson, MicrosoftGraphError } from "@/lib/microsoft/graph";
import { mapWithConcurrency } from "@/lib/utils/map-concurrency";

export type PlannerBucket = {
  id: string;
  name: string;
  planId: string;
};

export type PlannerTaskItem = {
  id: string;
  title: string;
  percentComplete: number;
  status: "open" | "done";
  dueDate: string | null;
  planId: string;
  planTitle: string | null;
  bucketId: string | null;
  bucketName: string | null;
  etag: string;
  href: string;
};

type GraphPlannerTask = {
  id?: string;
  title?: string;
  percentComplete?: number;
  dueDateTime?: string | null;
  planId?: string;
  bucketId?: string | null;
  "@odata.etag"?: string;
};

type GraphPlan = { id?: string; title?: string };
type GraphBucket = { id?: string; name?: string; planId?: string };

function plannerTaskHref(taskId: string): string {
  return `https://planner.cloud.microsoft/webui/task/${encodeURIComponent(taskId)}`;
}

function dueYmd(due: string | null | undefined): string | null {
  if (!due) return null;
  return due.slice(0, 10);
}

/**
 * Plan and bucket names, cached across requests. They are effectively static,
 * and every Graph call here competes for the 2-wide per-user mailbox gate —
 * so re-fetching them on each load was slowing down everything else too.
 */
const NAME_TTL_MS = 30 * 60_000;
const planTitleCache = new Map<string, { at: number; value: string | null }>();
const bucketNameCache = new Map<string, { at: number; value: string | null }>();

function readNameCache(
  cache: Map<string, { at: number; value: string | null }>,
  key: string
): { hit: boolean; value: string | null } {
  const entry = cache.get(key);
  if (!entry) return { hit: false, value: null };
  if (Date.now() - entry.at > NAME_TTL_MS) {
    cache.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: entry.value };
}

async function getPlanTitle(
  userId: number,
  planId: string
): Promise<string | null> {
  const key = `${userId}:${planId}`;
  const cached = readNameCache(planTitleCache, key);
  if (cached.hit) return cached.value;
  try {
    const plan = await graphJson<GraphPlan>(
      userId,
      `/planner/plans/${encodeURIComponent(planId)}`
    );
    const title = plan.title?.trim() || null;
    planTitleCache.set(key, { at: Date.now(), value: title });
    return title;
  } catch {
    planTitleCache.set(key, { at: Date.now(), value: null });
    return null;
  }
}

async function getBucketName(
  userId: number,
  bucketId: string
): Promise<string | null> {
  const key = `${userId}:${bucketId}`;
  const cached = readNameCache(bucketNameCache, key);
  if (cached.hit) return cached.value;
  try {
    const bucket = await graphJson<GraphBucket>(
      userId,
      `/planner/buckets/${encodeURIComponent(bucketId)}`
    );
    const name = bucket.name?.trim() || null;
    bucketNameCache.set(key, { at: Date.now(), value: name });
    return name;
  } catch {
    bucketNameCache.set(key, { at: Date.now(), value: null });
    return null;
  }
}

/** Buckets eines Plans (für Verschieben). */
export async function listPlannerBuckets(
  userId: number,
  planId: string
): Promise<PlannerBucket[]> {
  const page = await graphJson<{ value?: GraphBucket[] }>(
    userId,
    `/planner/plans/${encodeURIComponent(planId)}/buckets`
  );
  return (page.value || [])
    .map((b) => ({
      id: b.id || "",
      name: (b.name || "Bucket").trim(),
      planId: b.planId || planId,
    }))
    .filter((b) => b.id);
}

/**
 * Mir zugewiesene Planner-Aufgaben.
 * Optional: erledigte der letzten N Tage behalten (für Tagesanalyse-Match).
 */
export async function listMyPlannerTasks(
  userId: number,
  options?: {
    openOnly?: boolean;
  }
): Promise<PlannerTaskItem[]> {
  const openOnly = options?.openOnly ?? false;

  const page = await graphJson<{ value?: GraphPlannerTask[] }>(
    userId,
    "/me/planner/tasks"
  );

  const out: PlannerTaskItem[] = [];

  const usable = (page.value || []).filter(
    (t): t is GraphPlannerTask & { id: string; planId: string } => {
      if (!t.id || !(t.title || "").trim()) return false;
      if (openOnly && (Number(t.percentComplete) || 0) >= 100) return false;
      return Boolean(t.planId);
    }
  );

  /**
   * Warm the plan and bucket names first, in parallel. These lookups used to
   * sit inside the loop below, so every distinct plan and bucket cost its own
   * Graph round trip one after another — the reason the tasks tab took far
   * longer than mail or calendar. Afterwards every lookup is a cache hit.
   */
  const planIds = [...new Set(usable.map((t) => t.planId))];
  const bucketIds = [
    ...new Set(
      usable.map((t) => t.bucketId).filter((id): id is string => Boolean(id))
    ),
  ];
  const [planTitles, bucketNames] = await Promise.all([
    mapWithConcurrency(planIds, 6, (id) => getPlanTitle(userId, id)),
    mapWithConcurrency(bucketIds, 6, (id) => getBucketName(userId, id)),
  ]);
  const planById = new Map(planIds.map((id, i) => [id, planTitles[i] ?? null]));
  const bucketById = new Map(
    bucketIds.map((id, i) => [id, bucketNames[i] ?? null])
  );

  for (const t of usable) {
    const percent = Number(t.percentComplete) || 0;
    const status: "open" | "done" = percent >= 100 ? "done" : "open";
    const planId = t.planId;
    const bucketId = t.bucketId || null;
    const planTitle = planById.get(planId) ?? null;
    const bucketName = bucketId ? bucketById.get(bucketId) ?? null : null;
    out.push({
      id: t.id,
      title: (t.title || "").trim(),
      percentComplete: percent,
      status,
      dueDate: dueYmd(t.dueDateTime),
      planId,
      planTitle,
      bucketId,
      bucketName,
      etag: t["@odata.etag"] || "",
      href: plannerTaskHref(t.id),
    });
  }

  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const da = a.dueDate || "9999-99-99";
    const db = b.dueDate || "9999-99-99";
    const c = da.localeCompare(db);
    if (c !== 0) return c;
    return a.title.localeCompare(b.title, "de");
  });

  return out;
}

/** Mir zugewiesene Planner-Karten für den Tagesanalyse-Abgleich. */
export async function listPlannerTasksForMatch(userId: number): Promise<
  Array<{
    id: string;
    title: string;
    notes: string | null;
    status: "open" | "done";
    doneAt: string | null;
    href: string | null;
    source: "planner";
  }>
> {
  const tasks = await listMyPlannerTasks(userId, { openOnly: false });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: [
      t.planTitle ? `Plan: ${t.planTitle}` : null,
      t.bucketName ? `Bucket: ${t.bucketName}` : null,
      t.dueDate ? `Fällig: ${t.dueDate}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    status: t.status,
    doneAt: t.status === "done" ? new Date().toISOString() : null,
    href: t.href,
    source: "planner" as const,
  }));
}

export async function getPlannerTask(
  userId: number,
  taskId: string
): Promise<PlannerTaskItem> {
  const t = await graphJson<GraphPlannerTask>(
    userId,
    `/planner/tasks/${encodeURIComponent(taskId)}`
  );
  if (!t.id) throw new Error("Planner-Aufgabe nicht gefunden.");
  const planId = t.planId || "";
  const bucketId = t.bucketId || null;
  const [planTitle, bucketName] = await Promise.all([
    planId ? getPlanTitle(userId, planId) : Promise.resolve(null),
    bucketId ? getBucketName(userId, bucketId) : Promise.resolve(null),
  ]);
  const percent = Number(t.percentComplete) || 0;
  return {
    id: t.id,
    title: (t.title || "").trim() || "Aufgabe",
    percentComplete: percent,
    status: percent >= 100 ? "done" : "open",
    dueDate: dueYmd(t.dueDateTime),
    planId,
    planTitle,
    bucketId,
    bucketName,
    etag: t["@odata.etag"] || "",
    href: plannerTaskHref(t.id),
  };
}

export async function updatePlannerTask(
  userId: number,
  input: {
    taskId: string;
    etag?: string | null;
    percentComplete?: number;
    bucketId?: string;
    /** YYYY-MM-DD — Fälligkeit neu setzen; null entfernt das Datum. */
    dueDate?: string | null;
  }
): Promise<PlannerTaskItem> {
  let etag = input.etag?.trim() || "";
  if (!etag) {
    const fresh = await getPlannerTask(userId, input.taskId);
    etag = fresh.etag;
  }
  if (!etag) {
    throw new Error("Planner-Aufgabe: ETag fehlt (bitte Liste neu laden).");
  }
  const body: Record<string, unknown> = {};
  if (typeof input.percentComplete === "number") {
    body.percentComplete = Math.max(0, Math.min(100, input.percentComplete));
  }
  if (input.bucketId?.trim()) {
    body.bucketId = input.bucketId.trim();
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      body.dueDateTime = `${input.dueDate}T17:00:00Z`;
    } else {
      body.dueDateTime = null;
    }
  }
  if (Object.keys(body).length === 0) {
    throw new Error("Keine Änderung angegeben.");
  }

  const res = await graphFetch(
    userId,
    `/planner/tasks/${encodeURIComponent(input.taskId)}`,
    {
      method: "PATCH",
      headers: {
        "If-Match": etag,
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    // Veraltetes ETag → einmal neu laden und retry
    if (res.status === 412 || res.status === 409) {
      const fresh = await getPlannerTask(userId, input.taskId);
      const retry = await graphFetch(
        userId,
        `/planner/tasks/${encodeURIComponent(input.taskId)}`,
        {
          method: "PATCH",
          headers: {
            "If-Match": fresh.etag,
            Prefer: "return=representation",
          },
          body: JSON.stringify(body),
        }
      );
      const retryText = await retry.text();
      if (!retry.ok) {
        throw new Error(
          `Planner-Update fehlgeschlagen (${retry.status}): ${retryText.slice(0, 240)}`
        );
      }
      const updated = retryText
        ? (JSON.parse(retryText) as GraphPlannerTask)
        : {};
      return await mapUpdatedPlannerTask(userId, updated, input.taskId, fresh.etag);
    }
    throw new Error(
      `Planner-Update fehlgeschlagen (${res.status}): ${text.slice(0, 240)}`
    );
  }
  const updated = text ? (JSON.parse(text) as GraphPlannerTask) : {};
  return mapUpdatedPlannerTask(userId, updated, input.taskId, etag);
}

export async function deletePlannerTask(
  userId: number,
  input: { taskId: string; etag?: string | null }
): Promise<void> {
  const taskId = input.taskId.trim();
  if (!taskId) throw new Error("Planner-Aufgabe: ID fehlt.");
  let etag = input.etag?.trim() || "";
  if (!etag) {
    try {
      const fresh = await getPlannerTask(userId, taskId);
      etag = fresh.etag;
    } catch (error) {
      if (
        error instanceof MicrosoftGraphError &&
        (error.status === 404 || error.status === 410)
      ) {
        return;
      }
      throw error;
    }
  }
  if (!etag) {
    throw new Error("Planner-Aufgabe: ETag fehlt (bitte Liste neu laden).");
  }

  const res = await graphFetch(
    userId,
    `/planner/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "DELETE",
      headers: { "If-Match": etag },
    }
  );
  const text = await res.text();
  if (res.ok || res.status === 404 || res.status === 410) return;
  if (res.status === 412 || res.status === 409) {
    let freshEtag = "";
    try {
      const fresh = await getPlannerTask(userId, taskId);
      freshEtag = fresh.etag;
    } catch (error) {
      if (
        error instanceof MicrosoftGraphError &&
        (error.status === 404 || error.status === 410)
      ) {
        return;
      }
      throw error;
    }
    if (!freshEtag) {
      throw new Error("Planner-Aufgabe: ETag fehlt (bitte Liste neu laden).");
    }
    const retry = await graphFetch(
      userId,
      `/planner/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "DELETE",
        headers: { "If-Match": freshEtag },
      }
    );
    const retryText = await retry.text();
    if (retry.ok || retry.status === 404 || retry.status === 410) return;
    throw new Error(
      `Planner-Löschen fehlgeschlagen (${retry.status}): ${retryText.slice(0, 240)}`
    );
  }
  throw new Error(
    `Planner-Löschen fehlgeschlagen (${res.status}): ${text.slice(0, 240)}`
  );
}

async function mapUpdatedPlannerTask(
  userId: number,
  updated: GraphPlannerTask,
  fallbackId: string,
  fallbackEtag: string
): Promise<PlannerTaskItem> {
  const planId = updated.planId || "";
  const planTitle = planId ? await getPlanTitle(userId, planId) : null;
  const bucketId = updated.bucketId || null;
  const bucketName = bucketId
    ? await getBucketName(userId, bucketId)
    : null;
  const percent = Number(updated.percentComplete) || 0;
  const id = updated.id || fallbackId;
  return {
    id,
    title: (updated.title || "").trim() || "Aufgabe",
    percentComplete: percent,
    status: percent >= 100 ? "done" : "open",
    dueDate: dueYmd(updated.dueDateTime),
    planId,
    planTitle,
    bucketId,
    bucketName,
    etag: updated["@odata.etag"] || fallbackEtag,
    href: plannerTaskHref(id),
  };
}
