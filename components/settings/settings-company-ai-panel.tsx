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
  email: string;
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
  const [email, setEmail] = useState("");
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
    setEmail(json.email || "");
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
          baseUrl: baseUrl || null,
          email: email || null,
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
      setEmail(json.email || "");
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
          Führender Custom-Provider für alle Konten, typisch{" "}
          <code>gpt-4o-mini</code>. Solange das aktiv ist, gelten Key, Modell
          und Base-URL hier — persönliche Keys unter Konto werden nicht
          verwendet. Der Key liegt verschlüsselt in der Datenbank, nicht in der
          .env, ausser du setzt bewusst <code>COMPANY_AI_API_KEY</code> für
          Docker.
        </p>
        {fromEnv ? (
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs">
            Aktiv aus der Umgebung (.env). Felder hier sind dann nur Ergänzung;
            der Key kommt aus <code>COMPANY_AI_API_KEY</code>.
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
          <Label htmlFor="company-ai-url">Base-URL (optional)</Label>
          <Input
            id="company-ai-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://…/v1 — leer = api.openai.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-ai-email">Freigabe-E-Mail</Label>
          <Input
            id="company-ai-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="die Adresse, die der Provider kennt"
          />
          <p className="text-[0.6875rem] text-muted-foreground">
            Wird als Header <code>X-User-Email</code> mitgeschickt, falls der
            Gateway die Identität prüft.
          </p>
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
