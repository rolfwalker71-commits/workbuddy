"use client";

import { Card, CardContent } from "@/components/ui/card";
import { NotificationList } from "@/components/notifications/notification-list";

/**
 * Dieselbe Liste wie im Glocken-Panel, nur mit mehr Platz und grösseren Seiten.
 * Bewusst dieselbe Komponente, damit Gelesen-Logik und Gruppierung nicht in
 * zwei Fassungen auseinanderlaufen.
 */
export function NotificationsPagePanel() {
  return (
    <Card>
      <CardContent className="px-0">
        <NotificationList pageSize={50} />
      </CardContent>
    </Card>
  );
}
