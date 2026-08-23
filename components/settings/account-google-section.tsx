"use client";

import { Suspense } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { SettingsGoogleCalendarsPanel } from "@/components/settings/settings-google-calendars-panel";
import { SettingsGoogleConnectPanel } from "@/components/settings/settings-google-connect-panel";

export function AccountGoogleSection() {
  const { me, loading } = useAuth();
  const modules = me?.modules ?? [];
  const show = Boolean(me?.isAdmin || modules.includes("google"));
  if (loading || !show) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">Google Workspace</h2>
      <p className="text-xs text-muted-foreground">
        Eigener OAuth-Client plus dein Google-Konto — Tokens nur für dich.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Lade…</p>}>
        <SettingsGoogleConnectPanel />
      </Suspense>
      <SettingsGoogleCalendarsPanel />
    </section>
  );
}
