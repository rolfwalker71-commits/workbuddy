"use client";

import { History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export type MailWorkspaceView = "chronik" | "tagesanalysen";
export type MailWorkspaceAccent = "google" | "microsoft";

/** Soft pill tabs — muted track + elevated active pill. */
export function mailWorkspaceTabClass(
  active: boolean,
  _accent: MailWorkspaceAccent = "microsoft"
) {
  return segmentedTriggerClass(active);
}

export function MailWorkspaceSubnav({
  view,
  onChange,
  accent = "microsoft",
  className,
}: {
  view: MailWorkspaceView;
  onChange: (view: MailWorkspaceView) => void;
  accent?: MailWorkspaceAccent;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl bg-muted/40 px-3 py-3",
        className
      )}
    >
      <div
        className={segmentedTrackClass}
        role="tablist"
        aria-label={t("mail.viewAria")}
      >
        <Button
          type="button"
          variant="ghost"
          role="tab"
          data-segment="true"
          aria-selected={view === "chronik"}
          className={mailWorkspaceTabClass(view === "chronik", accent)}
          onClick={() => onChange("chronik")}
        >
          <History className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} aria-hidden />
          {t("workspace.chronicle")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          role="tab"
          data-segment="true"
          aria-selected={view === "tagesanalysen"}
          className={mailWorkspaceTabClass(view === "tagesanalysen", accent)}
          onClick={() => onChange("tagesanalysen")}
        >
          <Sparkles className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} aria-hidden />
          {t("workspace.dayAnalyses")}
        </Button>
      </div>
      {view === "chronik" ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {t("mail.chronikHint")}
        </p>
      ) : (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {t("mail.dayAnalysesHint")}
        </p>
      )}
    </div>
  );
}

export function mailWorkspacePrimaryBtnClass(accent: MailWorkspaceAccent = "microsoft") {
  return accent === "google"
    ? "bg-teal-800 text-white hover:bg-teal-800/90"
    : "bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90";
}
