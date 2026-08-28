"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type {
  HomeAbsenceState,
  HomeTtvDutyState,
} from "@/lib/dashboard/home-surfaces-shared";
import { PresenceHomeBar } from "@/components/presence/presence-home-bar";
import { zurichYmd } from "@/lib/microsoft/time";

export function HomeDutyAbsenceBar({
  ttvDuty,
  absence,
  onDutyChange,
}: {
  ttvDuty: HomeTtvDutyState | null;
  absence: HomeAbsenceState | null;
  onDutyChange: (next: HomeTtvDutyState) => void;
}) {
  const [busy, setBusy] = useState(false);

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

  return (
    <section className="space-y-2">
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
      <PresenceHomeBar absence={absence} />
    </section>
  );
}
