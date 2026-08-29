"use client";

import { useState } from "react";
import { Check, ListTodo, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

export type SuggestedTask = {
  title: string;
  notes?: string | null;
  reason?: string;
  source?: "heuristic" | "ai";
};

export function MicrosoftTaskSuggestions({
  suggestions,
  usedAi,
  loading,
  applying,
  error,
  onSuggest,
  onApply,
  suggestLabel,
  emptyHint,
}: {
  suggestions: SuggestedTask[];
  usedAi?: boolean;
  loading?: boolean;
  applying?: boolean;
  error?: string | null;
  onSuggest: () => void;
  onApply: (selected: SuggestedTask[]) => void;
  suggestLabel?: string;
  emptyHint?: string;
}) {
  const t = useT();
  const resolvedSuggest = suggestLabel ?? t("microsoft.suggestTasks");
  const resolvedEmpty = emptyHint ?? t("microsoft.noOpenPoints");
  const [picked, setPicked] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const selected = suggestions.filter((_, i) => picked.has(i));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || applying}
          onClick={() => {
            setPicked(new Set());
            onSuggest();
          }}
        >
          <Sparkles className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          {loading ? t("microsoft.checkingChat") : resolvedSuggest}
        </Button>
        {suggestions.length > 0 ? (
          <Button
            type="button"
            size="sm"
            disabled={applying || selected.length === 0}
            onClick={() => onApply(selected)}
          >
            <ListTodo className="size-3.5" strokeWidth={APP_ICON_STROKE} />
            {applying
              ? t("microsoft.creating")
              : selected.length
                ? t("microsoft.applyTasksN", { count: selected.length })
                : t("microsoft.applyTasks")}
          </Button>
        ) : null}
        {usedAi ? (
          <span className="text-[0.6875rem] text-muted-foreground">
            {t("common.companyAi")}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {suggestions.length === 0 && !loading ? (
        <p className="text-xs text-muted-foreground">{resolvedEmpty}</p>
      ) : null}
      {suggestions.length > 0 ? (
        <ul className="space-y-2">
          {suggestions.map((s, i) => {
            const on = picked.has(i);
            return (
              <li key={`${s.title}-${i}`}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-2xl bg-card px-3 py-2.5 text-left shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1",
                    on ? "ring-primary" : "ring-border/50 hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1",
                      on
                        ? "bg-primary text-primary-foreground ring-primary"
                        : "bg-muted ring-border"
                    )}
                    aria-hidden
                  >
                    {on ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">
                      {s.title}
                    </span>
                    {s.reason ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {s.reason}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
