"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import { MicrosoftTeamsLogo } from "@/components/branding/provider-logos";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

export function SettingsTeamsModulePanel() {
  const { refresh: refreshAuth } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/settings")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Einstellung laden fehlgeschlagen");
        }
        setEnabled(json.teamsModuleEnabled !== false);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, []);

  async function save(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamsModuleEnabled: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Speichern fehlgeschlagen");
      }
      setEnabled(json.teamsModuleEnabled !== false);
      setStatus(
        json.teamsModuleEnabled !== false
          ? "Teams-Modul ist für alle sichtbar."
          : "Teams-Modul ist für alle ausgeblendet."
      );
      await refreshAuth();
    } catch (err) {
      setEnabled(previous);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MicrosoftTeamsLogo className="size-4" />
          Microsoft Teams
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Modul für alle Benutzer anzeigen. Aus: kein Teams-Tab, keine Home-Karte,
          keine Chat-Analyse. Kalender-Transkripte bleiben.
        </p>
        <div
          className={segmentedTrackClass}
          role="tablist"
          aria-label="Microsoft Teams Modul"
        >
          <Button
            type="button"
            variant="ghost"
            role="tab"
            data-segment="true"
            aria-selected={enabled}
            disabled={busy}
            className={segmentedTriggerClass(enabled)}
            onClick={() => {
              if (!enabled) void save(true);
            }}
          >
            <Eye
              className="size-4 shrink-0"
              strokeWidth={APP_ICON_STROKE}
              aria-hidden
            />
            Anzeigen
          </Button>
          <Button
            type="button"
            variant="ghost"
            role="tab"
            data-segment="true"
            aria-selected={!enabled}
            disabled={busy}
            className={segmentedTriggerClass(!enabled)}
            onClick={() => {
              if (enabled) void save(false);
            }}
          >
            <EyeOff
              className="size-4 shrink-0"
              strokeWidth={APP_ICON_STROKE}
              aria-hidden
            />
            Ausblenden
          </Button>
        </div>
        {error ? <p className="text-destructive">{error}</p> : null}
        {status ? <p className="text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
