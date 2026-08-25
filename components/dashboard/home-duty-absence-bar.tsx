"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type {
  HomeAbsenceState,
  HomeTtvDutyState,
} from "@/lib/dashboard/home-surfaces-shared";
import { zurichYmd } from "@/lib/microsoft/time";

export function HomeDutyAbsenceBar({
  ttvDuty,
  absence,
  onDutyChange,
  onAbsenceChange,
}: {
  ttvDuty: HomeTtvDutyState | null;
  absence: HomeAbsenceState | null;
  onDutyChange: (next: HomeTtvDutyState) => void;
  onAbsenceChange: (next: HomeAbsenceState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [fromYmd, setFromYmd] = useState(absence?.self?.fromYmd || zurichYmd());
  const [toYmd, setToYmd] = useState(absence?.self?.toYmd || zurichYmd());
  const [message, setMessage] = useState(absence?.self?.message || "");
  const [formOpen, setFormOpen] = useState(false);

  async function claimDuty() {
    setBusy(true);
    try {
      const res = await fetch("/api/maringo/ttv-duty", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ymd: ttvDuty?.ymd || zurichYmd(), claim: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Übernehmen fehlgeschlagen");
      const entry = json.todayDuty || json.entry;
      onDutyChange({
        ymd: json.today || ttvDuty?.ymd || zurichYmd(),
        userId: entry?.userId ?? null,
        displayName: entry?.displayName ?? null,
        source: entry?.source ?? "claim",
        isMe: true,
        ttvInboxHref: "/maringo?filter=ttv",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveAbsence() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/absence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromYmd,
          toYmd,
          message,
          createOutlook: true,
        }),
      });
      const json = (await res.json()) as HomeAbsenceState & { error?: string };
      if (!res.ok) throw new Error(json.error || "Abwesenheit speichern fehlgeschlagen");
      onAbsenceChange(json);
      setFormOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function clearAbsence() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/absence", { method: "DELETE" });
      const json = (await res.json()) as HomeAbsenceState & { error?: string };
      if (!res.ok) throw new Error(json.error || "Abwesenheit löschen fehlgeschlagen");
      onAbsenceChange(json);
      setFormOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!ttvDuty && !absence) return null;

  const colleagues =
    absence?.colleagues.map((c) => c.displayName).filter(Boolean) || [];
  const awayLabel =
    colleagues.length > 0
      ? `Abwesend: ${colleagues.join(", ")}`
      : "Niemand abwesend";
  const selfLabel = absence?.self?.isAwayToday
    ? "Du: abwesend"
    : "Du: im Büro";

  return (
    <section className="grid gap-2 sm:grid-cols-2">
      {ttvDuty ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-orange-50/90 px-3 py-2.5 ring-1 ring-orange-200/80 dark:bg-orange-500/12 dark:ring-orange-400/30">
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-orange-950 dark:text-orange-100">
            TTV heute: {ttvDuty.displayName || "noch niemand"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {!ttvDuty.isMe ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void claimDuty()}
              >
                Übernehmen
              </Button>
            ) : (
              <span className="text-[0.6875rem] font-semibold text-orange-800 dark:text-orange-200">
                Du hast den Dienst
              </span>
            )}
            <Link
              href={ttvDuty.ttvInboxHref}
              className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-orange-900 underline-offset-2 hover:underline dark:text-orange-100"
            >
              <Inbox className="size-3.5" strokeWidth={APP_ICON_STROKE} />
              Inbox öffnen
            </Link>
          </div>
        </div>
      ) : null}

      {absence ? (
        <div className="space-y-2 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/80 dark:bg-slate-500/10 dark:ring-slate-400/25">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm leading-snug text-slate-800 dark:text-slate-100">
              <UserRound
                className="mr-1 inline size-3.5 align-[-0.125rem]"
                strokeWidth={APP_ICON_STROKE}
              />
              {awayLabel} · {selfLabel}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                absence.self?.isAwayToday
                  ? void clearAbsence()
                  : setFormOpen((v) => !v)
              }
            >
              {absence.self?.isAwayToday ? "Zurück" : "Abwesend"}
            </Button>
          </div>
          {formOpen ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="absence-from" className="text-[0.6875rem]">
                  Von
                </Label>
                <Input
                  id="absence-from"
                  type="date"
                  value={fromYmd}
                  onChange={(e) => setFromYmd(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="absence-to" className="text-[0.6875rem]">
                  Bis
                </Label>
                <Input
                  id="absence-to"
                  type="date"
                  value={toYmd}
                  onChange={(e) => setToYmd(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="absence-msg" className="text-[0.6875rem]">
                  Nachricht
                </Label>
                <Input
                  id="absence-msg"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional, z.B. Arzttermin"
                />
              </div>
              <div className="flex gap-1.5 sm:col-span-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void saveAbsence()}
                >
                  Speichern
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFormOpen(false)}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
