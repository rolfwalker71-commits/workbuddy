"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Unlink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleLogo } from "@/components/branding/provider-logos";
import { cn } from "@/lib/utils";

type Connection = {
  googleOauthConfigured: boolean;
  googleOauthClientId?: string | null;
  googleOauthRedirectUri?: string | null;
  ownerUserId: number | null;
  connected: boolean;
  connectedEmail: string | null;
  hasCalendarScope: boolean;
  hasCalendarEventsWrite: boolean;
  hasTasksScope: boolean;
  hasGmailModify?: boolean;
};

export function SettingsGoogleConnectPanel() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connRes, accRes] = await Promise.all([
        fetch("/api/google/connection"),
        fetch("/api/account"),
      ]);
      const json = await connRes.json();
      const acc = await accRes.json().catch(() => ({}));
      if (!connRes.ok) {
        throw new Error(json.error || "Status laden fehlgeschlagen");
      }
      setData(json as Connection);
      setClientId(
        String(acc.google?.clientId || json.googleOauthClientId || "")
      );
      setHasSecret(Boolean(acc.google?.hasGoogleOauthClient));
      setRedirectUri(String(json.googleOauthRedirectUri || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const flag = searchParams.get("google");
    if (flag === "connected") {
      setStatus("Google Workspace verbunden.");
      void load();
    } else if (flag === "error") {
      const reason = searchParams.get("reason") || "unbekannt";
      setError(`Verbindung fehlgeschlagen: ${reason}`);
    }
  }, [searchParams, load]);

  async function saveClient() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleOauthClientId: clientId || null,
          googleOauthClientSecret: clientSecret || undefined,
          clearGoogleOauthClientSecret: clearSecret,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setClientSecret("");
      setClearSecret(false);
      setStatus("OAuth-Client gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Dein Google-Konto von WorkBuddy trennen?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/google/oauth/disconnect", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Trennen fehlgeschlagen");
      setStatus("Google-Konto getrennt — gilt nur für dich.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canConnect = Boolean(data?.googleOauthConfigured);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
            <GoogleLogo className="size-4" />
          </span>
          Mein Google Workspace
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Jeder User hinterlegt <span className="font-medium text-foreground">eigene</span>{" "}
          OAuth-Client-Daten aus der Google Cloud Console und verbindet danach
          sein Konto. Es gibt keinen gemeinsamen App-Client.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : (
          <>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="text-sm text-emerald-700" role="status">
                {status}
              </p>
            ) : null}

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
              <div className="space-y-1">
                <Label htmlFor="g-client-id">OAuth-Client-ID</Label>
                <Input
                  id="g-client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="….apps.googleusercontent.com"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="g-client-secret">OAuth-Client-Secret</Label>
                <Input
                  id="g-client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => {
                    setClientSecret(e.target.value);
                    if (e.target.value) setClearSecret(false);
                  }}
                  autoComplete="new-password"
                  placeholder={hasSecret ? "Gesetzt — leer lassen zum Behalten" : "Secret einfügen"}
                  disabled={saving}
                />
                {hasSecret ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={clearSecret}
                      onChange={(e) => setClearSecret(e.target.checked)}
                      disabled={saving}
                    />
                    Secret entfernen
                  </label>
                ) : null}
              </div>
              {redirectUri ? (
                <div className="space-y-1">
                  <Label htmlFor="g-redirect">Redirect-URI für deine Cloud-App</Label>
                  <Input
                    id="g-redirect"
                    readOnly
                    value={redirectUri}
                    className="font-mono text-sm"
                    onFocus={(e) => e.target.select()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Diese URI in deinem Google-OAuth-Client als autorisierte
                    Weiterleitung eintragen.
                  </p>
                </div>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void saveClient()}
              >
                {saving ? "Speichert…" : "Client speichern"}
              </Button>
            </div>

            {data?.ownerUserId == null ? (
              <p className="text-sm text-amber-800">
                Kein App-User — Verbindung nicht möglich.
              </p>
            ) : !canConnect ? (
              <p className="text-sm text-amber-800">
                Zuerst Client-ID und Secret speichern, dann verbinden.
              </p>
            ) : data.connected ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm">
                    Verbunden als{" "}
                    <span className="font-medium">
                      {data.connectedEmail || "Google"}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    <Unlink className="size-3.5" />
                    Trennen
                  </Button>
                  <a
                    href="/api/google/oauth/start"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "gap-1.5"
                    )}
                  >
                    <Link2 className="size-3.5" />
                    Neu verbinden
                  </a>
                </div>
                {!data.hasCalendarScope ||
                !data.hasCalendarEventsWrite ||
                !data.hasTasksScope ||
                !data.hasGmailModify ? (
                  <p className="text-xs text-amber-800">
                    Scopes unvollständig — bitte neu verbinden (Mail, Kalender,
                    Tasks).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Mail, Kalender und Tasks aktiv.
                  </p>
                )}
              </div>
            ) : (
              <a
                href="/api/google/oauth/start"
                className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
              >
                <Link2 className="size-3.5" />
                Mein Google-Konto verbinden
              </a>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
