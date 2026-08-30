"use client";

import { useEffect, useState } from "react";
import { SettingsUsersPanel } from "@/components/settings/settings-users-panel";
import { SettingsCompanyAiPanel } from "@/components/settings/settings-company-ai-panel";
import { SettingsTeamsModulePanel } from "@/components/settings/settings-teams-module-panel";
import { SettingsVacationCalendarPanel } from "@/components/settings/settings-vacation-calendar-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TranslatedPageHeader } from "@/components/layout/translated-page-header";
import { useT } from "@/components/i18n/locale-provider";

type AdminSecrets = {
  appPublicUrl: string | null;
  microsoftOauthConfigured: boolean;
  microsoftOauthClientIdMasked: string | null;
  microsoftOauthTenant: string;
  microsoftOauthRedirectUri: string;
  mariBaseUrl: string;
  mariRestUsernameMasked: string | null;
  mariRestConfigured: boolean;
};

export default function SettingsPage() {
  const t = useT();
  const [secrets, setSecrets] = useState<AdminSecrets | null>(null);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => setSecrets(json))
      .catch(() => setSecrets(null));
  }, []);

  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <TranslatedPageHeader
        titleKey="settings.title"
        descriptionKey="settings.description"
        visual="settings"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.sharedSecrets")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("settings.sharedSecretsHint")}
          </p>
          <div className="space-y-2">
            <Label>{t("settings.publicAppUrl")}</Label>
            <Input readOnly value={secrets?.appPublicUrl || ""} />
          </div>
          <p>
            {t("settings.entraRedirect")}{" "}
            <code className="break-all text-xs">
              {secrets?.microsoftOauthRedirectUri || "—"}
            </code>
          </p>
          <p>
            {t("settings.microsoftClientId")}{" "}
            {secrets?.microsoftOauthClientIdMasked || t("common.notSet")} ·{" "}
            {t("settings.tenant")}{" "}
            {secrets?.microsoftOauthTenant || "organizations"}
          </p>
          <p>
            {t("settings.mariBaseUrl")} {secrets?.mariBaseUrl || "—"}
          </p>
          <p>
            {t("settings.mariRestUser")}{" "}
            {secrets?.mariRestUsernameMasked ||
              (secrets?.mariRestConfigured ? t("common.set") : t("common.notSet"))}
          </p>
        </CardContent>
      </Card>

      <SettingsTeamsModulePanel />
      <SettingsVacationCalendarPanel />
      <SettingsCompanyAiPanel />
      <SettingsUsersPanel />
    </div>
  );
}
