import { TranslatedPageHeader } from "@/components/layout/translated-page-header";
import { SettingsActivityPanel } from "@/components/settings/settings-activity-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aktivitätslog",
};

export default function ActivityPage() {
  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <TranslatedPageHeader
        titleKey="activity.title"
        descriptionKey="activity.description"
        visual="activity"
      />

      <SettingsActivityPanel />
    </div>
  );
}
