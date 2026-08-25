"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDaysYmd } from "@/lib/microsoft/time";

type DutyUser = { id: number; displayName: string };
type DutyDay = {
  ymd: string;
  userId: number;
  displayName: string;
  source: string;
};

export function SettingsTtvDutyPanel() {
  const [today, setToday] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<DutyDay[]>([]);
  const [users, setUsers] = useState<DutyUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const weekDays = useMemo(() => {
    if (!from) return [];
    return Array.from({ length: 7 }, (_, i) => addDaysYmd(from, i));
  }, [from]);

  async function load(weekStart?: string) {
    const qs = weekStart ? `?week=${encodeURIComponent(weekStart)}` : "";
    const res = await fetch(`/api/maringo/ttv-duty${qs}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "TTV-Dienst laden fehlgeschlagen");
    setToday(json.today);
    setFrom(json.from);
    setTo(json.to);
    setDays(json.days || []);
    setUsers(json.users || []);
    setIsAdmin(Boolean(json.isAdmin));
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, []);

  const byDay = useMemo(() => {
    const map = new Map(days.map((d) => [d.ymd, d]));
    return map;
  }, [days]);

  async function assign(ymd: string, userId: number | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/maringo/ttv-duty", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ymd, userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      await load(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!from) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">TTV-Dienst</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Wer hat den Tag. Der Ticket-Filter «TTV» bleibt daneben der Fallback
          für NEU-Tickets, falls niemand übernimmt.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load(addDaysYmd(from, -7))}
          >
            Vorwoche
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load(today)}
          >
            Diese Woche
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load(addDaysYmd(from, 7))}
          >
            Nächste
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {from} – {to}
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ul className="space-y-2">
          {weekDays.map((ymd) => {
            const entry = byDay.get(ymd);
            return (
              <li
                key={ymd}
                className="flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5 ring-1 ring-border/60"
              >
                <span className="w-28 shrink-0 font-semibold tabular-nums">
                  {ymd}
                  {ymd === today ? " · heute" : ""}
                </span>
                {isAdmin ? (
                  <select
                    className="h-8 min-w-[10rem] flex-1 rounded-lg border border-border/70 bg-background px-2 text-xs"
                    value={entry?.userId ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      const v = e.target.value;
                      void assign(ymd, v ? Number(v) : null);
                    }}
                  >
                    <option value="">— frei —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-muted-foreground">
                    {entry?.displayName || "frei"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
