"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
};

export function SettingsUsersPanel() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);

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
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, displayName, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Anlegen fehlgeschlagen");
      setUsername("");
      setEmail("");
      setDisplayName("");
      setPassword("");
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
      const res = await fetch(`/api/users/${editId}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: editModules }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Module speichern fehlgeschlagen");
      await fetch(`/api/users/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: editActive }),
      });
      setStatus("Zugriff gespeichert.");
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetSecrets(id: number) {
    if (!confirm("OpenAI-Key und Maringo-Passwort dieses Users entfernen?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clearMariRestPassword: true,
          clearOpenaiApiKey: true,
          mariRestUsername: null,
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
            <Label>Anzeigename</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Passwort</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
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
                    {user.has_mari_password ? <Badge>MARI</Badge> : null}
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
                    }}
                  >
                    Module
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
                <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
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
