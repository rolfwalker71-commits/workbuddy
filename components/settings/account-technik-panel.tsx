"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";

export function AccountTechnikPanel() {
  const t = useT();
  const { refresh } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/account")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || t("account.technikCalLoadFailed"));
        }
        setEnabled(json.technikEnabled !== false);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [t]);

  async function save(next: boolean) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technikEnabled: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("common.saveFailed"));
      setEnabled(json.technikEnabled !== false);
      setStatus(t("account.technikCalSaved"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench
            className="size-4 shrink-0"
            strokeWidth={APP_ICON_STROKE}
            aria-hidden
          />
          {t("account.technikCalTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted px-3 py-3">
          <input
            id="technik-nav-enabled"
            type="checkbox"
            className="mt-1 size-4 accent-[var(--brand-docs)]"
            checked={enabled}
            disabled={busy}
            onChange={(e) => void save(e.target.checked)}
          />
          <div className="min-w-0 space-y-1">
            <Label htmlFor="technik-nav-enabled" className="cursor-pointer">
              {t("nav.technik")}
            </Label>
            <p className="text-xs leading-snug text-muted-foreground">
              {t("account.technikCalHint")}
            </p>
          </div>
        </div>
        {error ? <p className="text-destructive">{error}</p> : null}
        {status ? <p className="text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
