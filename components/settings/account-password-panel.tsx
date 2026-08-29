"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n/locale-provider";

export function AccountPasswordPanel() {
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (newPassword !== confirmPassword) {
        throw new Error(t("account.passwordMismatch"));
      }
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || t("account.passwordChangeFailed"));
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus(t("account.passwordChanged"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("account.password")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void save(e)} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("account.passwordAdminHint")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="account-current-password">{t("account.passwordCurrent")}</Label>
            <Input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-11 max-w-md"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-new-password">{t("common.newPassword")}</Label>
            <Input
              id="account-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 max-w-md"
              minLength={6}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-confirm-password">{t("account.passwordConfirm")}</Label>
            <Input
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-11 max-w-md"
              minLength={6}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("account.passwordMin")}</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {status}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11">
            {busy ? t("common.saving") : t("account.passwordChange")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
