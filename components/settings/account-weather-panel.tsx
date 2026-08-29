"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n/locale-provider";

type WeatherHomeSetting = {
  query: string;
  label: string;
  lat: number;
  lon: number;
};

export function AccountWeatherPanel() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<WeatherHomeSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/me/weather")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || t("account.weatherLoadFailed"));
        if (json.weather) {
          setSaved(json.weather);
          setQuery(json.weather.query || "");
        }
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
      const res = await fetch("/api/me/weather", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weatherPlace: query }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("common.saveFailed"));
      setSaved(json.weather);
      setQuery(json.weather.query);
      setStatus(t("account.weatherSet", { label: json.weather.label }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("account.weatherTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("account.weatherHintLong")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="weather-place">{t("account.weatherPlace")}</Label>
            <Input
              id="weather-place"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("account.weatherPlacePh")}
              autoComplete="address-level2"
            />
          </div>
          {saved ? (
            <p className="text-xs text-muted-foreground">
              {t("account.weatherCurrent", {
                label: saved.label,
                lat: saved.lat.toFixed(3),
                lon: saved.lon.toFixed(3),
              })}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">{status}</p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11">
            {busy ? t("account.weatherSearching") : t("account.weatherSave")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
