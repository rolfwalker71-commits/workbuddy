"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n/locale-provider";

export function AccountDayClosePanel() {
  const t = useT();
  const [startHm, setStartHm] = useState("18:30");
  const [endHm, setEndHm] = useState("18:45");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/me/day-close")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || t("account.dayCloseLoadFailed"));
        }
        if (json.startHm) setStartHm(json.startHm);
        if (json.endHm) setEndHm(json.endHm);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [t]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/me/day-close", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startHm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("common.saveFailed"));
      setStartHm(json.startHm);
      setEndHm(json.endHm);
      setStatus(
        t("account.dayCloseSaved", { start: json.startHm, end: json.endHm })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("account.dayClose")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("account.dayCloseHintLong")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="day-close-start">{t("account.dayCloseStart")}</Label>
            <Input
              id="day-close-start"
              type="time"
              value={startHm}
              onValueChange={setStartHm}
              className="h-11 max-w-[9.5rem]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("account.dayCloseCurrent", { start: startHm, end: endHm })}
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {status}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11">
            {busy ? t("common.saving") : t("account.dayCloseSave")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
