import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { SettingsActivityPanel } from "@/components/settings/settings-activity-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aktivitätslog",
};

export default function ActivityPage() {
  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <PageHeader
        title="Aktivitätslog"
        description="Anmeldungen, Abmeldungen, abgelaufene Sessions und abgeschlossene Analysen (nur Admin)."
        icon={pageVisuals.activity.icon}
        tone={pageVisuals.activity.tone}
      />

      <SettingsActivityPanel />
    </div>
  );
}
