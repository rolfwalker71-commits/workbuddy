"use client";

import { Suspense } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { SettingsGoogleCalendarsPanel } from "@/components/settings/settings-google-calendars-panel";
import { SettingsGoogleConnectPanel } from "@/components/settings/settings-google-connect-panel";
import { AccountPageCopy } from "@/components/settings/account-page-copy";

export function AccountGoogleSection() {
  const { me, loading } = useAuth();
  const modules = me?.modules ?? [];
  const show = Boolean(me?.isAdmin || modules.includes("google"));
  if (loading || !show) return null;

  return (
    <section className="space-y-3">
      <AccountPageCopy titleKey="nav.google" hintKey="account.googleHint" />
      <Suspense fallback={<AccountPageCopy loading />}>
        <SettingsGoogleConnectPanel />
      </Suspense>
      <SettingsGoogleCalendarsPanel />
    </section>
  );
}
