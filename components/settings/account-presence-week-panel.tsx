"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PresenceStatusPills } from "@/components/presence/presence-status-pills";
import type { PresenceStatus } from "@/lib/presence/status";
import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
type WeekdayKey = (typeof WEEKDAYS)[number];
type Week = Partial<Record<WeekdayKey, PresenceStatus>>;

const WEEKDAY_KEYS: Record<WeekdayKey, MessageKey> = {
  mon: "presence.weekdays.mon",
  tue: "presence.weekdays.tue",
  wed: "presence.weekdays.wed",
  thu: "presence.weekdays.thu",
  fri: "presence.weekdays.fri",
};

export function AccountPresenceWeekPanel() {
  const t = useT();
  const [week, setWeek] = useState<Week>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/account/presence-week")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || t("account.weekLoadFailed"));
        }
        setWeek(json.week || {});
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [t]);

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
        throw new Error(json.error || t("common.saveFailed"));
      }
      setWeek(json.week || {});
      setStatus(t("common.savedPeriod"));
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
        <CardTitle className="text-base">{t("account.defaultWeek")}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">{t("account.weekHint")}</p>
        <div className="min-w-0 space-y-3">
          {WEEKDAYS.map((key) => {
            const dayLabel = t(WEEKDAY_KEYS[key]);
            return (
              <div key={key} className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium leading-snug">{dayLabel}</p>
                <PresenceStatusPills
                  value={week[key] ?? null}
                  onChange={(next) => setDay(key, next)}
                  onClear={() => setDay(key, null)}
                  disabled={busy}
                  ariaLabel={t("presence.weekdayStandard", { day: dayLabel })}
                />
              </div>
            );
          })}
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
