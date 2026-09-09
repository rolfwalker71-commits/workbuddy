"use client";

import { MicrosoftPlannerPanel } from "@/components/microsoft/microsoft-planner-panel";
import { useT } from "@/components/i18n/locale-provider";

export function WorkspaceTasksPanel({ microsoft }: { microsoft: boolean }) {
  const t = useT();
  if (!microsoft) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("workspace.noTaskAccount")}
      </p>
    );
  }
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <MicrosoftPlannerPanel />
      </section>
    </div>
  );
}
