"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ListPlus, RefreshCw } from "lucide-react";
import { GoogleTasksLogo } from "@/components/branding/provider-logos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MicrosoftPlannerPanel } from "@/components/microsoft/microsoft-planner-panel";
import { TaskCreateDialog } from "@/components/workspace/task-create-dialog";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

type GoogleTask = {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  dueDate: string | null;
  status: string;
  overdue: boolean;
  href: string;
};

type GoogleList = {
  id: string;
  title: string;
};

export function WorkspaceTasksPanel({
  microsoft,
  google,
}: {
  microsoft: boolean;
  google: boolean;
}) {
  return (
    <div className="space-y-8">
      {microsoft ? (
        <section className="space-y-3">
          <MicrosoftPlannerPanel />
        </section>
      ) : null}
      {google ? <GoogleTasksSection /> : null}
      {!microsoft && !google ? (
        <p className="text-sm text-muted-foreground">
          Kein Aufgaben-Konto verbunden.
        </p>
      ) : null}
    </div>
  );
}

function GoogleTasksSection() {
  const [tasks, setTasks] = useState<GoogleTask[]>([]);
  const [lists, setLists] = useState<GoogleList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        horizon: "14",
        includeCompleted: showDone ? "1" : "0",
        managed: showDone ? "1" : "0",
      });
      const res = await fetch(`/api/google/tasks?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Google Tasks laden fehlgeschlagen");
      setTasks((json.tasks || []) as GoogleTask[]);
      setLists((json.lists || []) as GoogleList[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [showDone]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, GoogleTask[]>();
    for (const t of tasks) {
      const key = t.listTitle || "Tasks";
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [tasks]);

  async function markDone(task: GoogleTask) {
    const key = `${task.listId}:${task.id}`;
    setBusyId(key);
    setError(null);
    try {
      const res = await fetch("/api/google/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          listId: task.listId,
          status: "completed",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Aktualisieren fehlgeschlagen");
      setTasks((prev) =>
        prev.filter((t) => !(t.id === task.id && t.listId === task.listId))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GoogleTasksLogo className="size-4" />
          Google Tasks
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <ListPlus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            Neue Aufgabe
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Erledigte laden
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              strokeWidth={APP_ICON_STROKE}
            />
            Aktualisieren
          </Button>
        </div>
      </div>
      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        provider="google"
        lists={lists}
        onCreated={() => void load()}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {loading && tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Google Tasks…</p>
      ) : null}
      {!loading && tasks.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Keine offenen Google Tasks im Horizont.
          </CardContent>
        </Card>
      ) : null}
      {grouped.map(([listTitle, listTasks]) => (
        <div key={listTitle} className="space-y-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {listTitle}
          </p>
          <ul className="space-y-2">
            {listTasks.map((task) => {
              const key = `${task.listId}:${task.id}`;
              const done = task.status === "completed";
              return (
                <li key={key}>
                  <Card>
                    <CardContent className="flex flex-wrap items-start justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                          {task.overdue
                            ? "Überfällig"
                            : task.dueDate
                              ? `fällig ${toSwissDate(task.dueDate)}`
                              : "ohne Termin"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={done ? "secondary" : "outline"}
                          className="text-[0.625rem]"
                        >
                          {done ? "Erledigt" : "Offen"}
                        </Badge>
                        {!done ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyId === key}
                            onClick={() => void markDone(task)}
                          >
                            <Check className="size-3.5" />
                            Erledigt
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
