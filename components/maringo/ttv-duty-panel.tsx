"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import { addDaysYmd } from "@/lib/microsoft/time";
import { weekRangeFrom } from "@/lib/mari/ttv-duty-shared";
import type { MariSupportGroupOption } from "@/lib/mari/ticket-meta";
import {
  parseMariSupportGroupId,
  supportGroupStaffHint,
} from "@/lib/mari/support-group-staff";

type DutyUser = {
  id: number;
  displayName: string;
  employeeNumber: string | null;
  supportGroupIds: number[];
};
type DutyDay = {
  ymd: string;
  userId: number;
  displayName: string;
  source: string;
};

export function TtvDutyPanel() {
  const [today, setToday] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<DutyDay[]>([]);
  const [users, setUsers] = useState<DutyUser[]>([]);
  const [groups, setGroups] = useState<MariSupportGroupOption[]>([]);
  const [supportGroupId, setSupportGroupId] = useState("");
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
    setUsers((json.users || []) as DutyUser[]);
    setGroups((json.groups || []) as MariSupportGroupOption[]);
    setSupportGroupId((prev) => {
      if (prev) return prev;
      return json.defaultSupportGroupId
        ? String(json.defaultSupportGroupId)
        : "";
    });
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

  const parsedGroupId = parseMariSupportGroupId(supportGroupId);
  const staffInGroup = useMemo(() => {
    if (groups.length === 0) return users;
    if (parsedGroupId == null) return [];
    return users.filter((u) =>
      (u.supportGroupIds || []).includes(parsedGroupId)
    );
  }, [groups.length, parsedGroupId, users]);

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

  if (!from) {
    return (
      <p className="text-sm text-muted-foreground">Lade TTV-Dienst…</p>
    );
  }

  const peopleDisabled = busy || (groups.length > 0 && parsedGroupId == null);

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
        <div
          className={segmentedTrackClass}
          role="tablist"
          aria-label="TTV-Woche"
        >
          <Button
            type="button"
            variant="ghost"
            role="tab"
            data-segment="true"
            aria-selected={false}
            className={segmentedTriggerClass(false)}
            disabled={busy}
            onClick={() => void load(addDaysYmd(from, -7))}
          >
            Vorwoche
          </Button>
          <Button
            type="button"
            variant="ghost"
            role="tab"
            data-segment="true"
            aria-selected={from === weekRangeFrom(today).fromYmd}
            className={segmentedTriggerClass(from === weekRangeFrom(today).fromYmd)}
            disabled={busy}
            onClick={() => void load(today)}
          >
            Diese Woche
          </Button>
          <Button
            type="button"
            variant="ghost"
            role="tab"
            data-segment="true"
            aria-selected={false}
            className={segmentedTriggerClass(false)}
            disabled={busy}
            onClick={() => void load(addDaysYmd(from, 7))}
          >
            Nächste
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {from} – {to}
        </p>
        {groups.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="ttv-duty-group">Supportgruppe</Label>
            <select
              id="ttv-duty-group"
              className="h-10 min-h-10 w-full rounded-xl border-0 bg-muted px-3 text-sm"
              value={supportGroupId}
              disabled={busy}
              onChange={(e) => setSupportGroupId(e.target.value)}
            >
              <option value="">— Supportgruppe —</option>
              {groups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.description}
                </option>
              ))}
            </select>
            {staffInGroup.length === 0 ? (
              <p className="text-[0.625rem] text-muted-foreground">
                {supportGroupStaffHint(parsedGroupId)}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ul className="space-y-2">
          {weekDays.map((ymd) => {
            const entry = byDay.get(ymd);
            const options = [...staffInGroup];
            if (
              entry &&
              !options.some((u) => u.id === entry.userId)
            ) {
              options.unshift({
                id: entry.userId,
                displayName: entry.displayName,
                employeeNumber: null,
                supportGroupIds: [],
              });
            }
            return (
              <li
                key={ymd}
                className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-3 py-2 ring-1 ring-border/60 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
              >
                <span className="w-32 shrink-0 font-semibold tabular-nums">
                  {ymd}
                  {ymd === today ? (
                    <span className="mt-0.5 block text-[0.6875rem] font-medium text-muted-foreground">
                      heute
                    </span>
                  ) : null}
                </span>
                <select
                  className="h-10 min-h-10 min-w-[10rem] flex-1 rounded-xl border-0 bg-muted px-3 text-sm disabled:opacity-70"
                  value={entry?.userId ?? ""}
                  disabled={peopleDisabled}
                  aria-label={`TTV ${ymd}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    void assign(ymd, v ? Number(v) : null);
                  }}
                >
                  <option value="">— frei —</option>
                  {options.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
