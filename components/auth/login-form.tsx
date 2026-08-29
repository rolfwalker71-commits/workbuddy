"use client";

import { useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BuddyLogo } from "@/components/brand/buddy-logo";
import { BRAND } from "@/lib/branding";
import { useT } from "@/components/i18n/locale-provider";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

export function LoginForm({
  nextPath,
  initialError = null,
}: {
  nextPath: string;
  initialError?: string | null;
}) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        home?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("auth.failed"));
      }
      const target =
        nextPath && nextPath !== "/"
          ? nextPath
          : data.home || "/";
      window.location.assign(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md border-white/50 bg-white/95 shadow-2xl shadow-slate-950/20 backdrop-blur">
      <CardHeader className="space-y-5 px-6 pb-2 pt-7 sm:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center">
              <BuddyLogo size={64} className="size-16 drop-shadow-md" priority />
            </span>
            <div>
              <p className="text-sm font-medium text-primary">{BRAND.app}</p>
              <CardTitle className="text-2xl">{t("auth.welcomeBack")}</CardTitle>
            </div>
          </div>
          <LocaleSwitcher />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("brand.tagline")}
        </p>
      </CardHeader>
      <CardContent className="px-6 pb-7 pt-5 sm:px-8">
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          {t("auth.hint")}
        </p>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="username">{t("auth.username")}</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-11 text-base"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 text-base"
              required
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <LockKeyhole />
            )}
            {loading ? t("auth.submitting") : t("auth.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
