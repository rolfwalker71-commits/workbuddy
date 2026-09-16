import { TranslatedPageHeader } from "@/components/layout/translated-page-header";
import { NotificationsPagePanel } from "@/components/notifications/notifications-page-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Benachrichtigungen",
};

export default function NotificationsPage() {
  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <TranslatedPageHeader
        titleKey="notifications.title"
        descriptionKey="notifications.pageHint"
      />

      <NotificationsPagePanel />
    </div>
  );
}
