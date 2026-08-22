import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { SettingsMicrosoftCalendarsPanel } from "@/components/settings/settings-microsoft-calendars-panel";
import { SettingsMicrosoftConnectPanel } from "@/components/settings/settings-microsoft-connect-panel";
import { NotificationPrefsPanel } from "@/components/settings/notification-prefs-panel";
import { AccountSecretsPanel } from "@/components/settings/account-secrets-panel";
import { AccountWeatherPanel } from "@/components/settings/account-weather-panel";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <PageHeader
        title="Konto"
        description="Dein Wetter, OpenAI-Key, Maringo-Login und Microsoft 365 — nur für dich."
        icon={pageVisuals.account.icon}
        tone={pageVisuals.account.tone}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Wetter</h2>
        <p className="text-xs text-muted-foreground">
          Standort für das Widget auf der Startseite — gilt nur für dich.
        </p>
        <AccountWeatherPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Geheimnisse</h2>
        <p className="text-xs text-muted-foreground">
          Keys und Passwörter werden verschlüsselt gespeichert und nie zurückgegeben.
        </p>
        <AccountSecretsPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Microsoft 365</h2>
        <p className="text-xs text-muted-foreground">
          Verbinde dein Work- oder Schulkonto. Eine Entra-App für alle User.
        </p>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Lade…</p>}>
          <SettingsMicrosoftConnectPanel />
        </Suspense>
        <SettingsMicrosoftCalendarsPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Benachrichtigungen</h2>
        <NotificationPrefsPanel />
      </section>
    </div>
  );
}
