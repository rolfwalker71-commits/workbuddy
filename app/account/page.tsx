import { Suspense } from "react";
import { TranslatedPageHeader } from "@/components/layout/translated-page-header";
import { AccountPageCopy } from "@/components/settings/account-page-copy";
import { SettingsMicrosoftCalendarsPanel } from "@/components/settings/settings-microsoft-calendars-panel";
import { SettingsMicrosoftConnectPanel } from "@/components/settings/settings-microsoft-connect-panel";
import { NotificationPrefsPanel } from "@/components/settings/notification-prefs-panel";
import { AccountSecretsPanel } from "@/components/settings/account-secrets-panel";
import { AccountPasswordPanel } from "@/components/settings/account-password-panel";
import { AccountWeatherPanel } from "@/components/settings/account-weather-panel";
import { AccountDayClosePanel } from "@/components/settings/account-day-close-panel";
import { AccountPresenceWeekPanel } from "@/components/settings/account-presence-week-panel";
import { AccountGoogleSection } from "@/components/settings/account-google-section";
import { MailSenderBlacklistAccountPanel } from "@/components/mail/mail-sender-blacklist-editor";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <TranslatedPageHeader
        titleKey="account.title"
        descriptionKey="account.description"
        visual="account"
      />

      <section className="space-y-3">
        <AccountPageCopy titleKey="account.weather" hintKey="account.weatherHint" />
        <AccountWeatherPanel />
      </section>

      <section className="space-y-3">
        <AccountPageCopy titleKey="account.defaultWeek" hintKey="account.defaultWeekHint" />
        <AccountPresenceWeekPanel />
      </section>

      <section className="space-y-3">
        <AccountPageCopy titleKey="account.dayClose" hintKey="account.dayCloseHint" />
        <AccountDayClosePanel />
      </section>

      <section className="space-y-3">
        <AccountPageCopy titleKey="account.password" hintKey="account.passwordHint" />
        <AccountPasswordPanel />
      </section>

      <section className="space-y-3">
        <AccountPageCopy titleKey="account.secrets" hintKey="account.secretsHint" />
        <AccountSecretsPanel />
      </section>

      <section className="space-y-3">
        <AccountPageCopy titleKey="nav.microsoft" hintKey="account.microsoftHint" />
        <Suspense fallback={<AccountPageCopy loading />}>
          <SettingsMicrosoftConnectPanel />
        </Suspense>
        <SettingsMicrosoftCalendarsPanel />
      </section>

      <AccountGoogleSection />

      <section className="space-y-3">
        <AccountPageCopy titleKey="account.hideMail" hintKey="account.hideMailHint" />
        <MailSenderBlacklistAccountPanel />
      </section>

      <section className="space-y-3">
        <AccountPageCopy titleKey="account.notifications" />
        <NotificationPrefsPanel />
      </section>
    </div>
  );
}
