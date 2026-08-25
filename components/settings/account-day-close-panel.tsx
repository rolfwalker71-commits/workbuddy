"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountDayClosePanel() {
  const [startHm, setStartHm] = useState("18:30");
  const [endHm, setEndHm] = useState("18:45");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/me/day-close")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Tagesabschluss laden fehlgeschlagen");
        }
        if (json.startHm) setStartHm(json.startHm);
        if (json.endHm) setEndHm(json.endHm);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/me/day-close", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startHm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setStartHm(json.startHm);
      setEndHm(json.endHm);
      setStatus(`Virtueller Termin: ${json.startHm}–${json.endHm} (Mo–Fr)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tagesabschluss</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Virtueller Buddy-Termin, nur für dich — nicht in Outlook oder Google.
            Mo–Fr, 15 Minuten. Ab dieser Uhrzeit öffnet der Assistent und die
            Abend-Erinnerung.
          </p>
          <div className="space-y-2">
            <Label htmlFor="day-close-start">Start (Europe/Zurich)</Label>
            <Input
              id="day-close-start"
              type="time"
              value={startHm}
              onValueChange={setStartHm}
              className="h-11 max-w-[9.5rem]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Aktuell {startHm}–{endHm}. Erlaubt 06:00–22:00.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {status}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11">
            {busy ? "Speichere…" : "Zeit speichern"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
