"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  LayoutGrid,
  ListPlus,
  ListTodo,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  MicrosoftPlannerLogo,
  MicrosoftToDoLogo,
} from "@/components/branding/provider-logos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MariTicketSelectCheckbox } from "@/components/maringo/mari-ticket-bulk-bar";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { cn } from "@/lib/utils";
import {
  readMsTaskDisplayPrefs,
  writeMsTaskDisplayPrefs,
} from "@/lib/microsoft/task-display-prefs";
import { useT } from "@/components/i18n/locale-provider";
import { TaskCreateDialog } from "@/components/workspace/task-create-dialog";

type PlannerTask = {
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

type PlannerBucket = {
  id: string;
  name: string;
  planId: string;
};

type TodoTask = {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  dueDate: string | null;
  status: "open" | "done";
  overdue: boolean;
  href: string;
};

type TodoList = {
  id: string;
  displayName: string;
  wellknownListName: string | null;
};

type SelectedTask =
  | { kind: "todo"; key: string; listId: string; id: string; title: string }
  | { kind: "planner"; key: string; id: string; etag: string; title: string };

type BulkProgress = {
  current: number;
  total: number;
  title: string;
};

function todoTaskKey(listId: string, id: string) {
  return `todo:${listId}:${id}`;
}

function plannerTaskKey(id: string) {
  return `planner:${id}`;
}

function MicrosoftTaskBulkBar({
  count,
  titles,
  busy,
  onSelectAll,
  onSelectNone,
  onDelete,
}: {
  count: number;
  titles: string[];
  busy: boolean;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const preview = titles.slice(0, 8).join(" · ");
  const extra = titles.length > 8 ? ` +${titles.length - 8}` : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/50 bg-secondary px-3 py-1.5">
      <p className="mr-1 text-[0.6875rem] font-semibold tabular-nums text-secondary-foreground">
        {t("microsoft.selectedCount", { count })}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 rounded-full px-2.5 text-[0.6875rem] font-semibold"
        disabled={busy}
        onClick={onSelectAll}
      >
        {t("microsoft.selectAll")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 rounded-full px-2.5 text-[0.6875rem] font-semibold"
        disabled={busy}
        onClick={onSelectNone}
      >
        {t("microsoft.selectNone")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="ml-auto h-7 text-[0.6875rem]"
        disabled={busy || count === 0}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        {t("common.delete")}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {count === 1
                ? t("microsoft.confirmDeleteN", { count })
                : t("microsoft.confirmDeleteNPlural", { count })}
            </DialogTitle>
            <DialogDescription>
              {t("microsoft.confirmDeleteDesc")}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <p className="break-words text-sm font-medium leading-snug">
              {preview}
              {extra}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              {t("microsoft.deleteForever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MicrosoftPlannerPanel() {
  const t = useT();
  const [plannerTasks, setPlannerTasks] = useState<PlannerTask[]>([]);
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([]);
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showTodo, setShowTodo] = useState(true);
  const [showPlanner, setShowPlanner] = useState(true);
  const [bucketsByPlan, setBucketsByPlan] = useState<
    Record<string, PlannerBucket[]>
  >({});
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plannerRes, todoRes] = await Promise.all([
        fetch("/api/microsoft/planner/tasks"),
        fetch("/api/microsoft/todo/tasks"),
      ]);
      const plannerJson = await plannerRes.json();
      const todoJson = await todoRes.json();
      const parts: string[] = [];
      const nextPlanner = plannerRes.ok
        ? ((plannerJson.tasks || []) as PlannerTask[])
        : [];
      const nextTodo = todoRes.ok
        ? ((todoJson.tasks || []) as TodoTask[])
        : [];
      if (plannerRes.ok) {
        setPlannerTasks(nextPlanner);
      } else {
        setPlannerTasks([]);
        parts.push(plannerJson.error || t("microsoft.loadPlannerFailed"));
      }
      if (todoRes.ok) {
        setTodoTasks(nextTodo);
        setTodoLists((todoJson.lists || []) as TodoList[]);
      } else {
        setTodoTasks([]);
        parts.push(todoJson.error || t("microsoft.loadToDoFailed"));
      }
      const valid = new Set([
        ...nextTodo.map((row) => todoTaskKey(row.listId, row.id)),
        ...nextPlanner.map((row) => plannerTaskKey(row.id)),
      ]);
      setSelectedKeys((prev) => {
        const next = new Set([...prev].filter((key) => valid.has(key)));
        return next.size === prev.size ? prev : next;
      });
      if (parts.length) setError(parts.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const prefs = readMsTaskDisplayPrefs();
    setShowTodo(prefs.todo);
    setShowPlanner(prefs.planner);
    void load();
  }, [load]);

  function persistDisplay(next: { todo: boolean; planner: boolean }) {
    setShowTodo(next.todo);
    setShowPlanner(next.planner);
    writeMsTaskDisplayPrefs(next);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const visiblePlanner = useMemo(() => {
    const list = plannerTasks.filter((t) => (showDone ? true : t.status === "open"));
    list.sort((a, b) => {
      const aOver = Boolean(a.status === "open" && a.dueDate && a.dueDate < todayIso);
      const bOver = Boolean(b.status === "open" && b.dueDate && b.dueDate < todayIso);
      if (aOver !== bOver) return aOver ? -1 : 1;
      const c = (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
      if (c !== 0) return c;
      return a.title.localeCompare(b.title, "de");
    });
    return list;
  }, [plannerTasks, showDone, todayIso]);

  const visibleTodo = useMemo(() => {
    const list = todoTasks.filter((t) => (showDone ? true : t.status === "open"));
    list.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const c = (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
      if (c !== 0) return c;
      return a.title.localeCompare(b.title, "de");
    });
    return list;
  }, [todoTasks, showDone]);

  const openPlanner = plannerTasks.filter((t) => t.status === "open").length;
  const openTodo = todoTasks.filter((t) => t.status === "open").length;

  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    if (showTodo) {
      for (const task of visibleTodo) {
        keys.push(todoTaskKey(task.listId, task.id));
      }
    }
    if (showPlanner) {
      for (const task of visiblePlanner) {
        keys.push(plannerTaskKey(task.id));
      }
    }
    return keys;
  }, [showTodo, showPlanner, visibleTodo, visiblePlanner]);

  const selectedTasks = useMemo((): SelectedTask[] => {
    const items: SelectedTask[] = [];
    for (const task of todoTasks) {
      const key = todoTaskKey(task.listId, task.id);
      if (!selectedKeys.has(key)) continue;
      items.push({
        kind: "todo",
        key,
        listId: task.listId,
        id: task.id,
        title: task.title,
      });
    }
    for (const task of plannerTasks) {
      const key = plannerTaskKey(task.id);
      if (!selectedKeys.has(key)) continue;
      items.push({
        kind: "planner",
        key,
        id: task.id,
        etag: task.etag,
        title: task.title,
      });
    }
    return items;
  }, [selectedKeys, todoTasks, plannerTasks]);

  function toggleSelected(key: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function deleteSelected() {
    const items = selectedTasks;
    if (items.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    setBulkProgress({
      current: 0,
      total: items.length,
      title: items[0]?.title || "",
    });
    const errors: { title: string; error: string }[] = [];
    const succeeded = new Set<string>();
    let done = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setBulkProgress({
          current: i,
          total: items.length,
          title: item.title,
        });
        try {
          if (item.kind === "todo") {
            const res = await fetch("/api/microsoft/todo/tasks", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: item.id, listId: item.listId }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(json.error || t("microsoft.todoDeleteFailed"));
            }
          } else {
            const res = await fetch("/api/microsoft/planner/tasks", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: item.id, etag: item.etag }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(json.error || t("microsoft.plannerDeleteFailed"));
            }
          }
          done += 1;
          succeeded.add(item.key);
        } catch (err) {
          errors.push({
            title: item.title,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        setBulkProgress({
          current: i + 1,
          total: items.length,
          title: item.title,
        });
      }

      const resultMsg = t("microsoft.deletedOf", {
        done,
        total: items.length,
      });
      setNotice(resultMsg);
      setError(
        errors.length
          ? errors
              .map((row) =>
                t("microsoft.deleteFailedNamed", {
                  title: row.title,
                  error: row.error,
                })
              )
              .join(" · ")
          : null
      );
      showActionFeedback({
        headline: resultMsg,
        detail: errors[0]?.error || undefined,
        tone: errors.length === 0 ? "success" : "error",
      });
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const key of succeeded) next.delete(key);
        return next;
      });
      await load();
    } finally {
      setBulkProgress(null);
      setBulkBusy(false);
    }
  }

  async function ensureBuckets(planId: string) {
    if (bucketsByPlan[planId]) return bucketsByPlan[planId];
    const res = await fetch(
      `/api/microsoft/planner/tasks?planId=${encodeURIComponent(planId)}`
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || t("microsoft.loadBucketsFailed"));
    const buckets = (json.buckets || []) as PlannerBucket[];
    setBucketsByPlan((prev) => ({ ...prev, [planId]: buckets }));
    return buckets;
  }

  async function patchPlanner(
    task: PlannerTask,
    patch: {
      percentComplete?: number;
      bucketId?: string;
      dueDate?: string | null;
    }
  ) {
    const key = `planner:${task.id}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/microsoft/planner/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          etag: task.etag,
          ...patch,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("microsoft.updateFailed"));
      const updated = json.task as PlannerTask;
      setPlannerTasks((prev) =>
        prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
      );
      let msg = t("microsoft.updatedNamed", { title: task.title });
      if (typeof patch.percentComplete === "number") {
        msg =
          patch.percentComplete >= 100
            ? t("microsoft.completedNamed", { title: task.title })
            : t("microsoft.reopenedNamed", { title: task.title });
      } else if (patch.dueDate !== undefined) {
        msg = patch.dueDate
          ? t("microsoft.rescheduledNamed", {
              title: task.title,
              date: toSwissDate(patch.dueDate) || patch.dueDate,
            })
          : t("microsoft.dueRemoved", { title: task.title });
      } else if (patch.bucketId) {
        msg = t("microsoft.movedBucket", { title: task.title });
      }
      setNotice(msg);
      showActionFeedback({
        headline: msg,
        detail: "Microsoft Planner",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: t("microsoft.plannerUpdateFailed"),
        detail: message,
        tone: "error",
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function patchTodo(
    task: TodoTask,
    patch: {
      status?: "notStarted" | "completed";
      dueDate?: string | null;
      title?: string;
      moveToListId?: string;
    }
  ) {
    const key = `todo:${task.listId}:${task.id}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/microsoft/todo/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          listId: task.listId,
          ...patch,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("microsoft.updateFailed"));
      const updated = json.task as TodoTask;
      const moved = Boolean(patch.moveToListId && patch.moveToListId !== task.listId);
      setTodoTasks((prev) => {
        if (moved) {
          return prev
            .filter((row) => !(row.id === task.id && row.listId === task.listId))
            .concat(updated);
        }
        return prev.map((row) =>
          row.id === task.id && row.listId === task.listId
            ? { ...row, ...updated }
            : row
        );
      });
      let msg = t("microsoft.updatedNamed", { title: task.title });
      if (patch.status === "completed")
        msg = t("microsoft.completedNamed", { title: task.title });
      else if (patch.status === "notStarted")
        msg = t("microsoft.reopenedNamed", { title: task.title });
      else if (patch.title)
        msg = t("microsoft.renamedNamed", { title: task.title });
      else if (patch.dueDate !== undefined) {
        msg = patch.dueDate
          ? t("microsoft.rescheduledNamed", {
              title: updated.title,
              date: toSwissDate(patch.dueDate) || patch.dueDate,
            })
          : t("microsoft.dueRemoved", { title: updated.title });
      } else if (moved) {
        msg = t("microsoft.movedToList", {
          title: updated.title,
          list: updated.listTitle,
        });
      }
      setNotice(msg);
      showActionFeedback({
        headline: msg,
        detail: "Microsoft To Do",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: t("microsoft.todoUpdateFailed"),
        detail: message,
        tone: "error",
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("workspace.tasks")}</p>
          <p className="text-xs text-muted-foreground">
            {showTodo
              ? t("microsoft.todoOpen", { count: openTodo })
              : t("microsoft.todoHidden")}
            {" · "}
            {showPlanner
              ? t("microsoft.plannerOpen", { count: openPlanner })
              : t("microsoft.plannerHidden")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showTodo}
              onChange={(e) =>
                persistDisplay({ todo: e.target.checked, planner: showPlanner })
              }
            />
            To Do
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showPlanner}
              onChange={(e) =>
                persistDisplay({ todo: showTodo, planner: e.target.checked })
              }
            />
            Planner
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            {t("common.showCompleted")}
          </label>
          <Button
            type="button"
            size="sm"
            disabled={bulkBusy}
            onClick={() => setCreateOpen(true)}
          >
            <ListPlus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            {t("workspace.newTask")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || bulkBusy}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              strokeWidth={APP_ICON_STROKE}
            />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        provider="microsoft"
        lists={todoLists.map((l) => ({ id: l.id, title: l.displayName }))}
        onCreated={() => {
          setNotice(t("common.createdTask"));
          void load();
        }}
      />

      {notice ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {selectedKeys.size > 0 || bulkProgress ? (
        <div className="space-y-2">
          {selectedKeys.size > 0 ? (
            <MicrosoftTaskBulkBar
              count={selectedKeys.size}
              titles={selectedTasks.map((item) => item.title)}
              busy={bulkBusy}
              onSelectAll={() => setSelectedKeys(new Set(visibleKeys))}
              onSelectNone={() => setSelectedKeys(new Set())}
              onDelete={() => void deleteSelected()}
            />
          ) : null}
          {bulkProgress ? (
            <ProgressBar
              value={
                bulkProgress.total === 0
                  ? 0
                  : (bulkProgress.current / bulkProgress.total) * 100
              }
              label={
                bulkProgress.title
                  ? t("microsoft.deletingNamed", { title: bulkProgress.title })
                  : t("microsoft.deletingTasks")
              }
              detail={`${bulkProgress.current} / ${bulkProgress.total}`}
            />
          ) : null}
        </div>
      ) : null}

      {loading && visiblePlanner.length === 0 && visibleTodo.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("common.loadingTasks")}</p>
      ) : null}

      {!showTodo && !showPlanner ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t("microsoft.bothHidden")}
          </CardContent>
        </Card>
      ) : null}

      {showTodo ? (
        <section className="space-y-3" aria-labelledby="ms-todo-heading">
          <h3
            id="ms-todo-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <MicrosoftToDoLogo className="size-4" />
            To Do
            <span className="text-xs font-normal text-muted-foreground">
              {t("common.openCountLower", { count: openTodo })}
            </span>
          </h3>
          {!loading && visibleTodo.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                {showDone
                  ? t("microsoft.noTodoTasks")
                  : t("microsoft.noOpenTodoTasks")}
              </CardContent>
            </Card>
          ) : null}
          <ul className="space-y-2">
            {visibleTodo.map((task) => {
              const key = todoTaskKey(task.listId, task.id);
              const selected = selectedKeys.has(key);
              const busy = busyKey === key || bulkBusy;
              const titleValue = titleDraft[key] ?? task.title;
              return (
              <li key={key}>
                <Card className={cn(selected && "bg-secondary")}>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <MariTicketSelectCheckbox
                        checked={selected}
                        disabled={bulkBusy}
                        label={t("microsoft.selectTask", { title: task.title })}
                        onCheckedChange={(checked) =>
                          toggleSelected(key, checked)
                        }
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                      <input
                        className="w-full rounded-md border border-transparent bg-transparent px-0 text-sm font-medium leading-snug outline-none focus:border-border focus:bg-background focus:px-2 focus:py-1"
                        disabled={busy}
                        value={titleValue}
                        onChange={(e) =>
                          setTitleDraft((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          const next = (titleDraft[key] ?? task.title).trim();
                          if (!next || next === task.title) {
                            setTitleDraft((prev) => {
                              const copy = { ...prev };
                              delete copy[key];
                              return copy;
                            });
                            return;
                          }
                          void patchTodo(task, { title: next }).then(() => {
                            setTitleDraft((prev) => {
                              const copy = { ...prev };
                              delete copy[key];
                              return copy;
                            });
                          });
                        }}
                        title={t("common.editTitle")}
                      />
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {[
                          task.listTitle || t("common.list"),
                          task.dueDate
                            ? t("common.dueOn", {
                                date: toSwissDate(task.dueDate),
                              })
                            : t("common.noDate"),
                          task.overdue ? t("common.overdueLower") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge
                      variant={task.status === "done" ? "secondary" : "outline"}
                      className="text-[0.625rem]"
                    >
                      {task.status === "done"
                        ? t("workspace.statusDone")
                        : t("workspace.statusOpen")}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {task.status === "open" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void patchTodo(task, { status: "completed" })
                        }
                      >
                        <Check
                          className="size-3.5"
                          strokeWidth={APP_ICON_STROKE}
                        />
                        {t("microsoft.complete")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void patchTodo(task, { status: "notStarted" })
                        }
                      >
                        {t("common.reopen")}
                      </Button>
                    )}

                    <input
                      type="date"
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      disabled={busy}
                      value={task.dueDate || ""}
                      onChange={(e) => {
                        const dueDate = e.target.value || null;
                        if (dueDate === (task.dueDate || null)) return;
                        void patchTodo(task, { dueDate });
                      }}
                      title={t("common.dueReset")}
                    />

                    <div className="inline-flex items-center gap-1.5">
                      <ListTodo
                        className="size-3.5 text-muted-foreground"
                        strokeWidth={APP_ICON_STROKE}
                      />
                      <select
                        className="h-8 max-w-[12rem] rounded-md border border-border bg-background px-2 text-xs"
                        disabled={busy || todoLists.length === 0}
                        value={task.listId}
                        onChange={(e) => {
                          const moveToListId = e.target.value;
                          if (!moveToListId || moveToListId === task.listId)
                            return;
                          void patchTodo(task, { moveToListId });
                        }}
                        title={t("common.moveList")}
                      >
                        {todoLists.length === 0 ? (
                          <option value={task.listId}>
                            {task.listTitle || t("common.list")}
                          </option>
                        ) : (
                          todoLists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.displayName}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <a
                      href={task.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink
                        className="size-3"
                        strokeWidth={APP_ICON_STROKE}
                      />
                      {t("microsoft.inToDo")}
                    </a>
                  </div>
                </CardContent>
              </Card>
            </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {showPlanner ? (
        <section className="space-y-3" aria-labelledby="ms-planner-heading">
          <h3
            id="ms-planner-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <MicrosoftPlannerLogo className="size-4" />
            Planner
            <span className="text-xs font-normal text-muted-foreground">
              {t("common.openCountLower", { count: openPlanner })}
            </span>
          </h3>
          {!loading && visiblePlanner.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                {showDone
                  ? t("microsoft.noPlannerTasks")
                  : t("microsoft.noOpenPlannerTasks")}
              </CardContent>
            </Card>
          ) : null}
          <ul className="space-y-2">
            {visiblePlanner.map((task) => {
              const key = plannerTaskKey(task.id);
              const selected = selectedKeys.has(key);
              const busy = busyKey === key || bulkBusy;
              const buckets = bucketsByPlan[task.planId] || [];
              return (
              <li key={key}>
                <Card className={cn(selected && "bg-secondary")}>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <MariTicketSelectCheckbox
                        checked={selected}
                        disabled={bulkBusy}
                        label={t("microsoft.selectTask", { title: task.title })}
                        onCheckedChange={(checked) =>
                          toggleSelected(key, checked)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                          {[
                            task.planTitle || t("common.plan"),
                            task.bucketName,
                            task.dueDate
                              ? t("common.dueOn", {
                                  date: toSwissDate(task.dueDate),
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Badge
                        variant={
                          task.status === "done" ? "secondary" : "outline"
                        }
                        className="text-[0.625rem]"
                      >
                        {task.status === "done"
                          ? t("workspace.statusDone")
                          : `${task.percentComplete}%`}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {task.status === "open" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void patchPlanner(task, { percentComplete: 100 })
                          }
                        >
                          <Check
                            className="size-3.5"
                            strokeWidth={APP_ICON_STROKE}
                          />
                          {t("microsoft.complete")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void patchPlanner(task, { percentComplete: 0 })
                          }
                        >
                          {t("common.reopen")}
                        </Button>
                      )}

                      <input
                        type="date"
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        disabled={busy}
                        value={task.dueDate || ""}
                        onChange={(e) => {
                          const dueDate = e.target.value || null;
                          if (dueDate === (task.dueDate || null)) return;
                          void patchPlanner(task, { dueDate });
                        }}
                        title={t("common.dueReset")}
                      />

                      <div className="inline-flex items-center gap-1.5">
                        <LayoutGrid
                          className="size-3.5 text-muted-foreground"
                          strokeWidth={APP_ICON_STROKE}
                        />
                        <select
                          className="h-8 max-w-[12rem] rounded-md border border-border bg-background px-2 text-xs"
                          disabled={busy}
                          value={task.bucketId || ""}
                          onFocus={() => {
                            void ensureBuckets(task.planId).catch((err) =>
                              setError(
                                err instanceof Error ? err.message : String(err)
                              )
                            );
                          }}
                          onChange={(e) => {
                            const bucketId = e.target.value;
                            if (!bucketId || bucketId === task.bucketId) return;
                            void patchPlanner(task, { bucketId });
                          }}
                        >
                          {buckets.length === 0 ? (
                            <option value={task.bucketId || ""}>
                              {task.bucketName || t("common.loadBuckets")}
                            </option>
                          ) : (
                            buckets.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <a
                        href={task.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                      >
                        <ExternalLink
                          className="size-3"
                          strokeWidth={APP_ICON_STROKE}
                        />
                        {t("microsoft.inPlanner")}
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
