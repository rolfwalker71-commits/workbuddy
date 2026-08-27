"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];

type AccountPayload = {
  mari: {
    mariBaseUrl: string;
    mariUsername: string;
    hasMariPassword: boolean;
    mariEmployeeNumber: string;
    mariConfigured: boolean;
    mariSharedLogin?: boolean;
  };
  openai: {
    hasOpenaiKey: boolean;
    hasPersonalOpenaiKey?: boolean;
    usingCompanyAi?: boolean;
    companyModel?: string | null;
    openaiModel: string;
    chatProvider: string;
    hasChatKey: boolean;
    chatBaseUrl: string;
    chatModel: string;
  };
};

export function AccountSecretsPanel() {
  const [data, setData] = useState<AccountPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [openaiKey, setOpenaiKey] = useState("");
  const [clearOpenai, setClearOpenai] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [chatProvider, setChatProvider] = useState("openai");
  const [chatKey, setChatKey] = useState("");
  const [clearChat, setClearChat] = useState(false);
  const [chatBaseUrl, setChatBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("");

  const [mariEmp, setMariEmp] = useState("");

  async function load() {
    setError(null);
    const res = await fetch("/api/account");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Konto laden fehlgeschlagen");
    setData(json);
    setOpenaiModel(json.openai?.openaiModel || "gpt-4o-mini");
    setChatProvider(json.openai?.chatProvider || "openai");
    setChatBaseUrl(json.openai?.chatBaseUrl || "");
    setChatModel(json.openai?.chatModel || "");
    setMariEmp(json.mari?.mariEmployeeNumber || "");
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, []);

  const usingCompanyAi = Boolean(data?.openai.usingCompanyAi);

  async function save() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(usingCompanyAi
            ? {}
            : {
                openaiApiKey: openaiKey || undefined,
                clearOpenaiApiKey: clearOpenai,
                openaiModel,
                chatProvider,
                chatApiKey: chatKey || undefined,
                clearChatApiKey: clearChat,
                chatBaseUrl: chatBaseUrl || null,
                chatModel: chatModel || null,
              }),
          mariEmployeeNumber: mariEmp || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setOpenaiKey("");
      setChatKey("");
      setClearOpenai(false);
      setClearChat(false);
      setStatus("Gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {data && usingCompanyAi ? (
        <p className="text-sm text-muted-foreground">
          Firmen-KI gilt für alle
          {data.openai.companyModel ? ` (${data.openai.companyModel})` : ""}.
          Persönliche Keys werden nicht genutzt.
        </p>
      ) : data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">OpenAI (Pflicht für KI)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {data.openai.hasOpenaiKey
                ? "Ein OpenAI-Key ist gesetzt (nicht sichtbar)."
                : "Kein Key hinterlegt — KI-Funktionen sind deaktiviert, ausser der Admin hinterlegt eine Firmen-KI."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="openai-key">Neuer OpenAI-Key</Label>
              <Input
                id="openai-key"
                type="password"
                autoComplete="off"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clearOpenai}
                onChange={(e) => setClearOpenai(e.target.checked)}
              />
              Key entfernen
            </label>
            <div className="space-y-2">
              <Label>Modell</Label>
              <Select
                value={openaiModel}
                onValueChange={(v) => {
                  if (v) setOpenaiModel(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_MODELS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Optional: Chat-Provider (Compose)</Label>
              <Select
                value={chatProvider}
                onValueChange={(v) => {
                  if (v) setChatProvider(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {chatProvider !== "openai" ? (
              <>
                <Input
                  type="password"
                  placeholder="Chat-API-Key"
                  value={chatKey}
                  onChange={(e) => setChatKey(e.target.value)}
                />
                <Input
                  placeholder="Base-URL"
                  value={chatBaseUrl}
                  onChange={(e) => setChatBaseUrl(e.target.value)}
                />
                <Input
                  placeholder="Chat-Modell"
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={clearChat}
                    onChange={(e) => setClearChat(e.target.checked)}
                  />
                  Chat-Key entfernen
                </label>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Maringo / MARI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mari-emp">Personalnummer</Label>
            <Input
              id="mari-emp"
              value={mariEmp}
              onChange={(e) => setMariEmp(e.target.value)}
              placeholder="M1010"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      <Button type="button" onClick={() => void save()} disabled={busy} className="h-11">
        {busy ? "Speichern…" : "Konto speichern"}
      </Button>
    </div>
  );
}
