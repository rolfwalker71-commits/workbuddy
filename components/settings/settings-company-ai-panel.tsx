"use client";

import { useEffect, useMemo, useState } from "react";
import { Server, Sparkles } from "lucide-react";
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
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  COMPANY_OPENAI_MODELS,
  type CompanyAiKind,
} from "@/lib/ai/company-ai-shared";
import { useT } from "@/components/i18n/locale-provider";

type CompanyAiPublic = {
  enabled: boolean;
  kind: CompanyAiKind;
  hasKey: boolean;
  model: string;
  baseUrl: string;
  source: "env" | "settings" | "none";
  error?: string;
};

export function SettingsCompanyAiPanel() {
  const t = useT();
  const [data, setData] = useState<CompanyAiPublic | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [kind, setKind] = useState<CompanyAiKind>("openai");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [model, setModel] = useState("gpt-4o-mini");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openaiModels = useMemo(() => {
    if (
      kind === "openai" &&
      model &&
      !(COMPANY_OPENAI_MODELS as readonly string[]).includes(model)
    ) {
      return [model, ...COMPANY_OPENAI_MODELS];
    }
    return [...COMPANY_OPENAI_MODELS];
  }, [kind, model]);

  async function load() {
    const res = await fetch("/api/settings/company-ai");
    const json = (await res.json()) as CompanyAiPublic;
    if (!res.ok) throw new Error(json.error || t("settings.companyAiLoadFailed"));
    setData(json);
    setEnabled(json.enabled);
    setKind(json.kind || "openai");
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
          kind,
          apiKey: apiKey.trim() || undefined,
          clearApiKey: clearKey,
          model,
          baseUrl: kind === "custom" ? baseUrl.trim() || null : null,
        }),
      });
      const json = (await res.json()) as CompanyAiPublic;
      if (!res.ok) throw new Error(json.error || t("common.saveFailed"));
      setApiKey("");
      setClearKey(false);
      setData(json);
      setEnabled(json.enabled);
      setKind(json.kind || "openai");
      setModel(json.model || "gpt-4o-mini");
      setBaseUrl(json.baseUrl || "");
      setStatus(t("settings.companyAiSaved"));
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
        <CardTitle className="text-base">{t("settings.companyAiTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{t("settings.companyAiHint")}</p>
        {fromEnv ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs">
            {t("settings.companyAiEnv")}
          </p>
        ) : null}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {t("settings.companyAiOn")}
        </label>
        <div
          className={segmentedTrackClass}
          role="tablist"
          aria-label={t("settings.companyAiProvider")}
        >
          <Button
            type="button"
            variant="ghost"
            role="tab"
            data-segment="true"
            aria-selected={kind === "openai"}
            className={segmentedTriggerClass(kind === "openai")}
            onClick={() => setKind("openai")}
          >
            <Sparkles
              className="size-4 shrink-0"
              strokeWidth={APP_ICON_STROKE}
              aria-hidden
            />
            OpenAI
          </Button>
          <Button
            type="button"
            variant="ghost"
            role="tab"
            data-segment="true"
            aria-selected={kind === "custom"}
            className={segmentedTriggerClass(kind === "custom")}
            onClick={() => setKind("custom")}
          >
            <Server
              className="size-4 shrink-0"
              strokeWidth={APP_ICON_STROKE}
              aria-hidden
            />
            Custom
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.hasKey
            ? t("settings.companyKeySet")
            : t("settings.companyKeyMissing")}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="company-ai-key">{t("settings.apiKey")}</Label>
          <Input
            id="company-ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={data?.hasKey ? t("settings.keyReplacePh") : "sk-…"}
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
          {t("account.removeKey")}
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="company-ai-model">{t("account.model")}</Label>
          {kind === "openai" ? (
            <Select
              value={model}
              onValueChange={(v) => {
                if (v) setModel(v);
              }}
            >
              <SelectTrigger id="company-ai-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {openaiModels.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="company-ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          )}
        </div>
        {kind === "custom" ? (
          <div className="space-y-1.5">
            <Label htmlFor="company-ai-url">{t("settings.companyUrl")}</Label>
            <Input
              id="company-ai-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://…/v1"
            />
          </div>
        ) : null}
        {error ? <p className="text-destructive">{error}</p> : null}
        {status ? <p className="text-muted-foreground">{status}</p> : null}
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? t("common.saving") : t("settings.saveCompanyAi")}
        </Button>
      </CardContent>
    </Card>
  );
}
