"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanyAiPublic = {
  enabled: boolean;
  hasKey: boolean;
  model: string;
  baseUrl: string;
  source: "env" | "settings" | "none";
  error?: string;
};

export function SettingsCompanyAiPanel() {
  const [data, setData] = useState<CompanyAiPublic | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [model, setModel] = useState("gpt-4o-mini");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/company-ai");
    const json = (await res.json()) as CompanyAiPublic;
    if (!res.ok) throw new Error(json.error || "Firmen-KI laden fehlgeschlagen");
    setData(json);
    setEnabled(json.enabled);
    setModel(json.model || "gpt-4o-mini");
    setBaseUrl(json.baseUrl || "");
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
      const res = await fetch("/api/settings/company-ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          apiKey: apiKey.trim() || undefined,
          clearApiKey: clearKey,
          model,
          baseUrl: baseUrl.trim() || null,
        }),
      });
      const json = (await res.json()) as CompanyAiPublic;
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setApiKey("");
      setClearKey(false);
      setData(json);
      setEnabled(json.enabled);
      setModel(json.model || "gpt-4o-mini");
      setBaseUrl(json.baseUrl || "");
      setStatus("Firmen-KI gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const fromEnv = data?.source === "env";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Firmen-KI (alle User)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Führender Custom-Provider für alle Konten. Trage genau die drei
          Angaben vom Provider ein: API-Key, Modell und URL. Solange das aktiv
          ist, gelten diese Werte — persönliche Keys unter Konto werden nicht
          verwendet. Der Key liegt verschlüsselt in der Datenbank, nicht in der
          .env, ausser du setzt bewusst <code>COMPANY_AI_*</code> für Docker.
        </p>
        {fromEnv ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs">
            Aktiv aus der Umgebung (.env). Der Key kommt aus{" "}
            <code>COMPANY_AI_API_KEY</code>.
          </p>
        ) : null}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Firmen-KI aktiv
        </label>
        <p className="text-xs text-muted-foreground">
          {data?.hasKey
            ? "Ein Firmen-Key ist gesetzt (nicht sichtbar)."
            : "Noch kein Firmen-Key."}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="company-ai-key">API-Key</Label>
          <Input
            id="company-ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={data?.hasKey ? "gesetzt — neu nur zum Ersetzen" : "sk-…"}
            disabled={fromEnv}
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={clearKey}
            onChange={(e) => setClearKey(e.target.checked)}
            disabled={fromEnv}
          />
          Key entfernen
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="company-ai-model">Modell</Label>
          <Input
            id="company-ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-ai-url">URL</Label>
          <Input
            id="company-ai-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://…/v1"
          />
        </div>
        {error ? <p className="text-destructive">{error}</p> : null}
        {status ? <p className="text-muted-foreground">{status}</p> : null}
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Speichern…" : "Firmen-KI speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
