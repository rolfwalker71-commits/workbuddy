"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WeatherHomeSetting = {
  query: string;
  label: string;
  lat: number;
  lon: number;
};

export function AccountWeatherPanel() {
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<WeatherHomeSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/me/weather")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Wetter laden fehlgeschlagen");
        if (json.weather) {
          setSaved(json.weather);
          setQuery(json.weather.query || "");
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, []);

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
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setSaved(json.weather);
      setQuery(json.weather.query);
      setStatus(`Standort gesetzt: ${json.weather.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wetter-Standort</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nur für dich, auf der Startseite. Open-Meteo, kein API-Key nötig.
          </p>
          <div className="space-y-2">
            <Label htmlFor="weather-place">Ort</Label>
            <Input
              id="weather-place"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z. B. Altdorf UR"
              autoComplete="address-level2"
            />
          </div>
          {saved ? (
            <p className="text-xs text-muted-foreground">
              Aktuell: {saved.label} · {saved.lat.toFixed(3)}, {saved.lon.toFixed(3)}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">{status}</p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11">
            {busy ? "Suche Ort…" : "Standort speichern"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
