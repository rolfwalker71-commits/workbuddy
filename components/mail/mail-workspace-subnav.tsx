"use client";

import { History, ListChecks, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export type MailWorkspaceView = "chronik" | "triage" | "tagesanalysen";
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
  pendingTriage = 0,
}: {
  view: MailWorkspaceView;
  onChange: (view: MailWorkspaceView) => void;
  accent?: MailWorkspaceAccent;
  className?: string;
  pendingTriage?: number;
}) {
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
        aria-label="Mail-Ansicht"
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
          Chronik
        </Button>
        <Button
          type="button"
          variant="ghost"
          role="tab"
          data-segment="true"
          aria-selected={view === "triage"}
          className={mailWorkspaceTabClass(view === "triage", accent)}
          onClick={() => onChange("triage")}
        >
          <ListChecks className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} aria-hidden />
          Triage
          {pendingTriage > 0 ? (
            <Badge variant="secondary" className="text-[0.625rem]">
              {pendingTriage}
            </Badge>
          ) : null}
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
          Tagesanalysen
        </Button>
      </div>
      {view === "chronik" ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Eingang und Gesendet gemischt, chronologisch
        </p>
      ) : view === "triage" ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Offene Vorschläge aus der Einzelmail-Analyse
        </p>
      ) : (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Gespeicherte AI-Tagesbilder und neue Analyse
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
