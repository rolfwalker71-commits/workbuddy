import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { SettingsMicrosoftCalendarsPanel } from "@/components/settings/settings-microsoft-calendars-panel";
import { SettingsMicrosoftConnectPanel } from "@/components/settings/settings-microsoft-connect-panel";
import { NotificationPrefsPanel } from "@/components/settings/notification-prefs-panel";
import { AccountSecretsPanel } from "@/components/settings/account-secrets-panel";
import { AccountPasswordPanel } from "@/components/settings/account-password-panel";
import { AccountWeatherPanel } from "@/components/settings/account-weather-panel";
import { AccountDayClosePanel } from "@/components/settings/account-day-close-panel";
import { AccountPresenceWeekPanel } from "@/components/settings/account-presence-week-panel";
import { AccountGoogleSection } from "@/components/settings/account-google-section";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <PageHeader
        title="Konto"
        description="Dein Wetter, Standardwoche, Tagesabschluss, Anmeldepasswort, Maringo-Personalnummer, Microsoft 365 und Google Workspace — nur für dich."
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
        <h2 className="text-sm font-semibold tracking-tight">Standardwoche</h2>
        <p className="text-xs text-muted-foreground">
          Deine Anwesenheits-Regel für Montag bis Freitag. Abweichungen setzt du
          auf Team oder Home.
        </p>
        <AccountPresenceWeekPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Tagesabschluss</h2>
        <p className="text-xs text-muted-foreground">
          Uhrzeit des virtuellen Rituals — gilt nur für dich, wie der Wetter-Standort.
        </p>
        <AccountDayClosePanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Anmeldepasswort</h2>
        <p className="text-xs text-muted-foreground">
          Ändere dein WorkBuddy-Login — gilt nur für dich.
        </p>
        <AccountPasswordPanel />
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
          Nach neuen Teams-/Transkript-Rechten einmal neu verbinden.
        </p>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Lade…</p>}>
          <SettingsMicrosoftConnectPanel />
        </Suspense>
        <SettingsMicrosoftCalendarsPanel />
      </section>

      <AccountGoogleSection />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Benachrichtigungen</h2>
        <NotificationPrefsPanel />
      </section>
    </div>
  );
}
