"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";

const MAX_VIEWS = 8;

export type MariTicketSavedViewChip = {
  id: string;
  label: string;
  handledBy: string[];
  statuses: number[];
  overdueOnly: boolean;
  showOnHome: boolean;
  count: number | null;
  href: string;
};

export function MariTicketSavedViewsBar({
  views,
  onReload,
  canSave,
  onSave,
  onApply,
  disabled,
}: {
  views: MariTicketSavedViewChip[];
  onReload: () => void;
  canSave: boolean;
  onSave: (label: string, showOnHome: boolean) => Promise<void>;
  onApply: (view: MariTicketSavedViewChip) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [showOnHome, setShowOnHome] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function save() {
    const label = name.trim();
    if (!label) {
      setError(t("tickets.nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(label, showOnHome);
      setName("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/maringo/ticket-views/${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("tickets.deleteFailed"));
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {views.map((view) => (
          <span key={view.id} className="inline-flex items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onApply(view)}
              className={cn(
                "h-auto rounded-full rounded-r-none px-2.5 py-1 text-[0.6875rem] font-semibold",
                "border-border/70 bg-background"
              )}
            >
              {view.label}
              <span className="ml-1 tabular-nums text-muted-foreground">
                {view.count == null ? "—" : view.count}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled || busy}
              aria-label={t("tickets.deleteViewAria", { label: view.label })}
              onClick={() => void remove(view.id)}
              className="size-7 rounded-full rounded-l-none border-l-0"
            >
              <X className="size-3" strokeWidth={APP_ICON_STROKE} />
            </Button>
          </span>
        ))}
        {views.length < MAX_VIEWS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || !canSave}
            onClick={() => setOpen((v) => !v)}
            className="h-auto rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold"
          >
            <BookmarkPlus className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            {t("tickets.saveView")}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/30 p-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("tickets.viewNamePh")}
            className="h-9 text-sm"
            maxLength={60}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showOnHome}
              onChange={(e) => setShowOnHome(e.target.checked)}
            />
            {t("tickets.showOnHome")}
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
