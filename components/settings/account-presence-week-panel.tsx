"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PresenceStatusPills } from "@/components/presence/presence-status-pills";
import type { PresenceStatus } from "@/lib/presence/status";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
type WeekdayKey = (typeof WEEKDAYS)[number];
type Week = Partial<Record<WeekdayKey, PresenceStatus>>;

const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Montag",
  tue: "Dienstag",
  wed: "Mittwoch",
  thu: "Donnerstag",
  fri: "Freitag",
};

export function AccountPresenceWeekPanel() {
  const [week, setWeek] = useState<Week>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/account/presence-week")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Standardwoche laden fehlgeschlagen");
        }
        setWeek(json.week || {});
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, []);

  async function saveWeek(next: Week) {
    const previous = week;
    setWeek(next);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/account/presence-week", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Speichern fehlgeschlagen");
      }
      setWeek(json.week || {});
      setStatus("Gespeichert.");
    } catch (err) {
      setWeek(previous);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function setDay(key: WeekdayKey, value: PresenceStatus | null) {
    const next: Week = { ...week };
    if (value == null) delete next[key];
    else next[key] = value;
    void saveWeek(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Standardwoche</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Die Regel für jede Woche — auch die aktuelle. Einzelne Tage setzt du
          nur, wenn sie davon abweichen. Tippe einen gesetzten Status erneut, um
          den Wochentag zu leeren.
        </p>
        <div className="min-w-0 space-y-3">
          {WEEKDAYS.map((key) => (
            <div key={key} className="min-w-0 space-y-1.5">
              <p className="text-sm font-medium leading-snug">
                {WEEKDAY_LABELS[key]}
              </p>
              <PresenceStatusPills
                value={week[key] ?? null}
                onChange={(next) => setDay(key, next)}
                onClear={() => setDay(key, null)}
                disabled={busy}
                ariaLabel={`${WEEKDAY_LABELS[key]} Standard`}
              />
            </div>
          ))}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {status ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            {status}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
