"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";

type TechUpgradesCalendarPublic = {
  mailbox: string;
  defaultMailbox: string;
  readerUserId: number | null;
  readerLabel: string | null;
  error?: string;
};

export function SettingsTechUpgradesCalendarPanel() {
  const t = useT();
  const [mailbox, setMailbox] = useState("");
  const [defaultMailbox, setDefaultMailbox] = useState("");
  const [readerLabel, setReaderLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/tech-upgrades-calendar");
    const json = (await res.json()) as TechUpgradesCalendarPublic;
    if (!res.ok) {
      throw new Error(json.error || t("settings.techUpgradesCalLoadFailed"));
    }
    setMailbox(json.mailbox);
    setDefaultMailbox(json.defaultMailbox);
    setReaderLabel(json.readerLabel);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/tech-upgrades-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox }),
      });
      const json = (await res.json()) as TechUpgradesCalendarPublic;
      if (!res.ok) {
        throw new Error(json.error || t("common.saveFailed"));
      }
      setMailbox(json.mailbox);
      setDefaultMailbox(json.defaultMailbox);
      setReaderLabel(json.readerLabel);
      setStatus(t("settings.techUpgradesCalSaved"));
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
          {t("settings.techUpgradesCalTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t("settings.techUpgradesCalHint")}
        </p>
        <div className="space-y-2">
          <Label htmlFor="tech-upgrades-cal-mailbox">
            {t("settings.techUpgradesCalMailbox")}
          </Label>
          <Input
            id="tech-upgrades-cal-mailbox"
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={mailbox}
            placeholder={defaultMailbox}
            onChange={(event) => setMailbox(event.target.value)}
          />
        </div>
        <p className="text-muted-foreground">
          {t("settings.techUpgradesCalShareHint")}
        </p>
        {readerLabel ? (
          <p className="text-muted-foreground">
            {t("settings.techUpgradesCalReader", { name: readerLabel })}
          </p>
        ) : null}
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {t("common.save")}
        </Button>
        {error ? <p className="text-destructive">{error}</p> : null}
        {status ? <p className="text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
