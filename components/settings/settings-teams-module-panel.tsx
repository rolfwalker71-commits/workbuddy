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
import { useT } from "@/components/i18n/locale-provider";

export function SettingsTeamsModulePanel() {
  const t = useT();
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
          throw new Error(json.error || t("settings.teamsLoadFailed"));
        }
        setEnabled(json.teamsModuleEnabled !== false);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [t]);

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
        throw new Error(json.error || t("common.saveFailed"));
      }
      setEnabled(json.teamsModuleEnabled !== false);
      setStatus(
        json.teamsModuleEnabled !== false
          ? t("settings.teamsVisible")
          : t("settings.teamsHidden")
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
          {t("settings.teamsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t("settings.teamsHint")}</p>
        <div
          className={segmentedTrackClass}
          role="tablist"
          aria-label={t("settings.teamsAria")}
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
            {t("common.show")}
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
            {t("common.hide")}
          </Button>
        </div>
        {error ? <p className="text-destructive">{error}</p> : null}
        {status ? <p className="text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
