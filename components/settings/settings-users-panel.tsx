"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import {
  USER_ORGANIZATIONS,
  parseUserOrganization,
  type UserOrganization,
} from "@/lib/users/organization";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { organizationDisplayLabel } from "@/lib/i18n/display";
import { OrganizationWithFlag } from "@/components/branding/country-flag";

type AppUser = {
  id: number;
  username: string;
  email: string;
  display_name: string;
  active: number;
  is_admin: number;
  modules: string[];
  has_mari_password: boolean;
  has_openai_key: boolean;
  mari_employee_number?: string | null;
  organization?: UserOrganization | null;
  can_manage_presence?: number;
  canManagePresence?: boolean;
};

function OrganizationPills({
  id,
  value,
  onChange,
}: {
  id: string;
  value: UserOrganization | null;
  onChange: (next: UserOrganization) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <div
      id={id}
      className={cn(segmentedTrackClass, "w-full max-w-full flex-nowrap")}
      role="radiogroup"
      aria-label={t("common.organization")}
    >
      {USER_ORGANIZATIONS.map((code) => (
        <Button
          key={code}
          type="button"
          variant="ghost"
          role="radio"
          aria-checked={value === code}
          className={cn(segmentedTriggerClass(value === code), "flex-1 min-w-0")}
          onClick={() => onChange(code)}
        >
          <OrganizationWithFlag
            organization={code}
            label={organizationDisplayLabel(code, locale)}
            locale={locale}
          />
        </Button>
      ))}
    </div>
  );
}

export function SettingsUsersPanel() {
  const t = useT();
  const { locale } = useLocale();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState<UserOrganization | null>(
    null
  );
  const [canManagePresence, setCanManagePresence] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editOrganization, setEditOrganization] =
    useState<UserOrganization | null>(null);
  const [editCanManagePresence, setEditCanManagePresence] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || t("settings.usersLoadFailed"));
    setUsers(json.users || []);
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, []);

  async function createUser() {
    setBusy(true);
    setError(null);
    try {
      if (!username.trim() || !email.trim() || !password.trim()) {
        throw new Error(t("settings.requiredFields"));
      }
      if (password.trim().length < 6) {
        throw new Error(t("settings.passwordMin6"));
      }
      if (!organization) {
        throw new Error(t("settings.orgRequired"));
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          displayName,
          password,
          organization,
          canManagePresence,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("common.createFailed"));
      setUsername("");
      setEmail("");
      setDisplayName("");
      setPassword("");
      setOrganization(null);
      setCanManagePresence(false);
      setStatus(t("settings.userCreated"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAccess() {
    if (editId == null) return;
    setBusy(true);
    setError(null);
    try {
      const name = editDisplayName.trim();
      if (!name) throw new Error(t("settings.displayNameEmpty"));
      const res = await fetch(`/api/users/${editId}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: editModules }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("settings.modulesSaveFailed"));
      const patchRes = await fetch(`/api/users/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          active: editActive,
          organization: editOrganization,
          canManagePresence: editCanManagePresence,
          ...(editPassword.trim() ? { password: editPassword } : {}),
        }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok) {
        throw new Error(patchJson.error || t("settings.userSaveFailed"));
      }
      setStatus(t("settings.userSaved"));
      setEditId(null);
      setEditPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetSecrets(id: number) {
    if (!confirm(t("settings.confirmClearOpenai"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clearOpenaiApiKey: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("settings.resetFailed"));
      setStatus(t("settings.secretsResetDone"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(id: number) {
    if (!confirm(t("settings.confirmDeleteUser"))) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    await load();
  }

  function toggleModule(key: string) {
    setEditModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.usersTitle")}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("settings.usersHint")}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("common.username")}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("common.email")}</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-display-name">{t("common.displayName")}</Label>
            <Input
              id="new-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("settings.displayNamePh")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("common.password")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("settings.passwordPh")}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-organization">{t("common.organization")}</Label>
          <OrganizationPills
            id="new-organization"
            value={organization}
            onChange={setOrganization}
          />
        </div>
        <label className="flex items-start gap-2 text-sm leading-relaxed">
          <input
            type="checkbox"
            className="mt-1"
            checked={canManagePresence}
            onChange={(e) => setCanManagePresence(e.target.checked)}
          />
          <span>
            {t("settings.manageOthers")}
            <span className="mt-0.5 block text-muted-foreground">
              {t("settings.manageOthersHint")}
            </span>
          </span>
        </label>
        <Button type="button" className="h-11" disabled={busy} onClick={() => void createUser()}>
          <Plus className="size-4" /> {t("settings.createUser")}
        </Button>

        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{user.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.username} · {user.email}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(user.modules || []).map((m) => (
                      <Badge key={m} variant="secondary">
                        {m}
                      </Badge>
                    ))}
                    {user.active ? null : <Badge variant="destructive">{t("common.inactive")}</Badge>}
                    {user.has_openai_key ? <Badge>OpenAI</Badge> : null}
                    {user.mari_employee_number ? (
                      <Badge>MARI {user.mari_employee_number}</Badge>
                    ) : null}
                    {parseUserOrganization(user.organization) ? (
                      <Badge variant="secondary">
                        <OrganizationWithFlag
                          organization={parseUserOrganization(user.organization)}
                          label={organizationDisplayLabel(
                            parseUserOrganization(user.organization)!,
                            locale
                          )}
                          locale={locale}
                        />
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t("presence.noOrganization")}</Badge>
                    )}
                    {user.canManagePresence || user.can_manage_presence ? (
                      <Badge>{t("settings.stati")}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditId(user.id);
                      setEditModules(user.modules || []);
                      setEditActive(Boolean(user.active));
                      setEditDisplayName(user.display_name);
                      setEditPassword("");
                      setEditOrganization(
                        parseUserOrganization(user.organization)
                      );
                      setEditCanManagePresence(
                        Boolean(
                          user.canManagePresence || user.can_manage_presence
                        )
                      );
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void resetSecrets(user.id)}>
                    {t("settings.secretsReset")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void removeUser(user.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {editId === user.id ? (
                <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`display-name-${user.id}`}>{t("common.displayName")}</Label>
                      <Input
                        id={`display-name-${user.id}`}
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`password-${user.id}`}>{t("common.newPassword")}</Label>
                      <Input
                        id={`password-${user.id}`}
                        type="password"
                        autoComplete="new-password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder={t("settings.keepPassword")}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`organization-${user.id}`}>
                      {t("common.organization")}
                    </Label>
                    <OrganizationPills
                      id={`organization-${user.id}`}
                      value={editOrganization}
                      onChange={setEditOrganization}
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={editCanManagePresence}
                      onChange={(e) =>
                        setEditCanManagePresence(e.target.checked)
                      }
                    />
                    <span>
                      {t("settings.manageOthers")}
                      <span className="mt-0.5 block text-muted-foreground">
                        {t("settings.manageOthersHint")}
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editModules.includes("microsoft")}
                      onChange={() => toggleModule("microsoft")}
                    />
                    Microsoft 365
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editModules.includes("google")}
                      onChange={() => toggleModule("google")}
                    />
                    Google Workspace
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editModules.includes("maringo")}
                      onChange={() => toggleModule("maringo")}
                    />
                    Maringo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    {t("common.active")}
                  </label>
                  <Button type="button" onClick={() => void saveAccess()} disabled={busy}>
                    {t("common.save")}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
