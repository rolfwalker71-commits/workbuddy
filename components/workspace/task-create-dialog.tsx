"use client";

import { useEffect, useState } from "react";
import { ListPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n/locale-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export type TaskListOption = {
  id: string;
  title: string;
};

export function TaskCreateDialog({
  open,
  onOpenChange,
  provider,
  lists,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: "microsoft" | "google";
  lists: TaskListOption[];
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [listId, setListId] = useState("");
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setNotes("");
    setDueDate("");
    setError(null);
    setBusy(false);
    setListId(lists[0]?.id || "");
  }, [open, lists]);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("common.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url =
        provider === "google"
          ? "/api/google/tasks"
          : "/api/microsoft/todo/tasks";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          notes: notes.trim() || null,
          dueDate: dueDate || null,
          ...(provider === "google"
            ? { tasklistId: listId || null }
            : { listId: listId || null }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || t("workspace.createTaskFailed"));
      }
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus
              className="size-4 text-teal-700"
              strokeWidth={APP_ICON_STROKE}
              absoluteStrokeWidth
              aria-hidden
            />
            {t("workspace.newTask")}
          </DialogTitle>
          <DialogDescription>
            {provider === "google"
              ? t("workspace.createInGoogleTasks")
              : t("workspace.createInToDo")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="task-title">{t("common.title")}</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("workspace.whatToDo")}
              maxLength={200}
              disabled={busy}
              autoFocus
            />
          </div>
          {lists.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="task-list">{t("common.list")}</Label>
              <select
                id="task-list"
                className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm"
                value={listId}
                disabled={busy}
                onChange={(e) => setListId(e.target.value)}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="task-due">{t("common.dueOptional")}</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">{t("common.notesOptional")}</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={4000}
              disabled={busy}
              className="resize-y text-[0.8125rem]"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || !title.trim()} className="w-full">
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("workspace.createTask")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
