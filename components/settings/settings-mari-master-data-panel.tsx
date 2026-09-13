"use client";

import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";

type MasterDataStatus = {
  syncedAt: string | null;
  contracts: number;
  positions: number;
  lastSyncAt: string | null;
  intervalMs: number;
  error?: string;
};

export function SettingsMariMasterDataPanel() {
  const t = useT();
  const [status, setStatus] = useState<MasterDataStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/maringo/master-data");
    const json = (await res.json()) as MasterDataStatus;
    if (!res.ok) {
      throw new Error(json.error || t("settings.mariMasterLoadFailed"));
    }
    setStatus(json);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
    // Einmal beim Öffnen; der Abgleich selbst läuft im Scheduler.
  }, []);

  async function refresh() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/maringo/master-data", { method: "POST" });
      const json = (await res.json()) as MasterDataStatus & { message?: string };
      if (!res.ok) {
        throw new Error(json.error || t("settings.mariMasterLoadFailed"));
      }
      setStatus(json);
      setMessage(json.message ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const syncedAt = status?.lastSyncAt || status?.syncedAt || null;
  // Nach dem Mount gerendert, darum ist die lokale Zeitzone hier unkritisch.
  const when = syncedAt ? new Date(syncedAt).toLocaleString() : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database
            className="size-4 shrink-0"
            strokeWidth={APP_ICON_STROKE}
            aria-hidden
          />
          {t("settings.mariMasterTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t("settings.mariMasterHint")}</p>
        <p>
          {status && when
            ? t("settings.mariMasterState", {
                contracts: status.contracts,
                positions: status.positions,
                when,
              })
            : t("settings.mariMasterNever")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {t("settings.mariMasterRefresh")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("settings.mariMasterRefreshHint")}
          </span>
        </div>
        {message ? <p className="text-muted-foreground">{message}</p> : null}
        {error ? <p className="text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
