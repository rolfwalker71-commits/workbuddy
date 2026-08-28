"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, Trash2 } from "lucide-react";
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
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  USER_ORGANIZATION_LABELS,
  USER_ORGANIZATIONS,
  parseUserOrganization,
  type UserOrganization,
} from "@/lib/users/organization";

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
  return (
    <div
      id={id}
      className={cn(segmentedTrackClass, "h-auto")}
      role="radiogroup"
      aria-label="Organisation"
    >
      {USER_ORGANIZATIONS.map((code) => (
        <Button
          key={code}
          type="button"
          variant="ghost"
          role="radio"
          aria-checked={value === code}
          className={segmentedTriggerClass(value === code)}
          onClick={() => onChange(code)}
        >
          <Building2
            className="size-4 shrink-0"
            strokeWidth={APP_ICON_STROKE}
            aria-hidden
          />
          {USER_ORGANIZATION_LABELS[code]}
        </Button>
      ))}
    </div>
  );
}

export function SettingsUsersPanel() {
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
    if (!res.ok) throw new Error(json.error || "User laden fehlgeschlagen");
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
        throw new Error("Benutzername, E-Mail und Passwort sind Pflicht.");
      }
      if (password.trim().length < 6) {
        throw new Error("Passwort muss mindestens 6 Zeichen haben.");
      }
      if (!organization) {
        throw new Error("Organisation ist Pflicht.");
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
      if (!res.ok) throw new Error(json.error || "Anlegen fehlgeschlagen");
      setUsername("");
      setEmail("");
      setDisplayName("");
      setPassword("");
      setOrganization(null);
      setCanManagePresence(false);
      setStatus("User angelegt.");
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
      if (!name) throw new Error("Anzeigename darf nicht leer sein.");
      const res = await fetch(`/api/users/${editId}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: editModules }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Module speichern fehlgeschlagen");
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
        throw new Error(patchJson.error || "Benutzer speichern fehlgeschlagen");
      }
      setStatus("Benutzer gespeichert.");
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
    if (!confirm("OpenAI-Key dieses Users entfernen?")) return;
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
      if (!res.ok) throw new Error(json.error || "Reset fehlgeschlagen");
      setStatus("Secrets zurückgesetzt.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(id: number) {
    if (!confirm("User wirklich löschen?")) return;
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
        <CardTitle className="text-base">Benutzer</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nur Admins legen Konten an und vergeben Passwort sowie Anzeigename
          (Seitenleiste). Microsoft 365 verbindet jede Person selbst unter
          Konto — nach der Anmeldung mit Benutzername und Passwort.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Benutzername</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-Mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-display-name">Anzeigename</Label>
            <Input
              id="new-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Wie in der Seitenleiste"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Passwort</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mindestens 6 Zeichen"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-organization">Organisation</Label>
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
            Stati anderer pflegen
            <span className="mt-0.5 block text-muted-foreground">
              Darf Anwesenheit von Kolleginnen und Kollegen derselben
              Organisation setzen
            </span>
          </span>
        </label>
        <Button type="button" className="h-11" disabled={busy} onClick={() => void createUser()}>
          <Plus className="size-4" /> User anlegen
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
                    {user.active ? null : <Badge variant="destructive">inaktiv</Badge>}
                    {user.has_openai_key ? <Badge>OpenAI</Badge> : null}
                    {user.mari_employee_number ? (
                      <Badge>MARI {user.mari_employee_number}</Badge>
                    ) : null}
                    {parseUserOrganization(user.organization) ? (
                      <Badge variant="secondary">
                        {
                          USER_ORGANIZATION_LABELS[
                            parseUserOrganization(user.organization)!
                          ]
                        }
                      </Badge>
                    ) : (
                      <Badge variant="outline">Ohne Organisation</Badge>
                    )}
                    {user.canManagePresence || user.can_manage_presence ? (
                      <Badge>Stati</Badge>
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
                    Bearbeiten
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void resetSecrets(user.id)}>
                    Secrets reset
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
                      <Label htmlFor={`display-name-${user.id}`}>Anzeigename</Label>
                      <Input
                        id={`display-name-${user.id}`}
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`password-${user.id}`}>Neues Passwort</Label>
                      <Input
                        id={`password-${user.id}`}
                        type="password"
                        autoComplete="new-password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Leer lassen, um behalten"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`organization-${user.id}`}>
                      Organisation
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
                      Stati anderer pflegen
                      <span className="mt-0.5 block text-muted-foreground">
                        Darf Anwesenheit von Kolleginnen und Kollegen derselben
                        Organisation setzen
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
                    Aktiv
                  </label>
                  <Button type="button" onClick={() => void saveAccess()} disabled={busy}>
                    Speichern
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
