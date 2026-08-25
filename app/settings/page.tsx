"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { SettingsUsersPanel } from "@/components/settings/settings-users-panel";
import { SettingsTtvDutyPanel } from "@/components/settings/settings-ttv-duty-panel";
import { SettingsCompanyAiPanel } from "@/components/settings/settings-company-ai-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdminSecrets = {
  appPublicUrl: string | null;
  microsoftOauthConfigured: boolean;
  microsoftOauthClientIdMasked: string | null;
  microsoftOauthTenant: string;
  microsoftOauthRedirectUri: string;
  mariBaseUrl: string;
};

export default function SettingsPage() {
  const [secrets, setSecrets] = useState<AdminSecrets | null>(null);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => setSecrets(json))
      .catch(() => setSecrets(null));
  }, []);

  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <PageHeader
        title="Einstellungen"
        description="User und gemeinsame Server-Secrets (nur Admin)."
        icon={pageVisuals.settings.icon}
        tone={pageVisuals.settings.tone}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gemeinsame Secrets (.env)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Client-ID, Client-Secret und Session-Secret stehen nur in der Umgebung — nicht hier editierbar.
          </p>
          <div className="space-y-2">
            <Label>Öffentliche App-URL</Label>
            <Input readOnly value={secrets?.appPublicUrl || ""} />
          </div>
          <p>
            Entra Redirect:{" "}
            <code className="break-all text-xs">
              {secrets?.microsoftOauthRedirectUri || "—"}
            </code>
          </p>
          <p>
            Microsoft Client-ID:{" "}
            {secrets?.microsoftOauthClientIdMasked || "nicht gesetzt"} · Tenant{" "}
            {secrets?.microsoftOauthTenant || "organizations"}
          </p>
          <p>MARI Basis-URL: {secrets?.mariBaseUrl || "—"}</p>
        </CardContent>
      </Card>

      <SettingsCompanyAiPanel />
      <SettingsTtvDutyPanel />
      <SettingsUsersPanel />
    </div>
  );
}
