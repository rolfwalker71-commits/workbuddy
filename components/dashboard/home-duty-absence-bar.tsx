"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { segmentedTriggerProps } from "@/components/layout/segmented-control";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type {
  HomeAbsenceState,
  HomeTtvDutyState,
} from "@/lib/dashboard/home-surfaces-shared";
import { PresenceHomeBar } from "@/components/presence/presence-home-bar";
import { zurichYmd } from "@/lib/microsoft/time";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";

export function HomeDutyAbsenceBar({
  ttvDuty,
  absence,
  onDutyChange,
}: {
  ttvDuty: HomeTtvDutyState | null;
  absence: HomeAbsenceState | null;
  onDutyChange: (next: HomeTtvDutyState) => void;
}) {
  const t = useT();
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
      if (!res.ok) throw new Error(json.error || t("duty.claimFailed"));
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
    <section
      className={cn("grid items-stretch gap-2", ttvDuty && "lg:grid-cols-2")}
    >
      {ttvDuty ? (
        <div className="flex h-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-orange-50 px-3 py-2 ring-1 ring-orange-200/80 dark:bg-orange-500/15 dark:ring-orange-400/30">
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-orange-950 dark:text-orange-100">
            {t("duty.ttvToday", {
              name: ttvDuty.displayName || t("duty.nobodyYet"),
            })}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {!ttvDuty.isMe ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                {...segmentedTriggerProps}
                onClick={() => void claimDuty()}
              >
                {t("duty.claim")}
              </Button>
            ) : (
              <span className="text-[0.7rem] font-semibold leading-snug text-orange-800 dark:text-orange-200">
                {t("duty.youHaveDuty")}
              </span>
            )}
            <Link
              href={ttvDuty.ttvInboxHref}
              className="inline-flex items-center gap-1 px-1.5 text-[0.75rem] font-semibold text-orange-900 underline-offset-2 hover:underline dark:text-orange-100"
            >
              <Inbox className="size-3.5" strokeWidth={APP_ICON_STROKE} />
              {t("duty.openInbox")}
            </Link>
          </div>
        </div>
      ) : null}
      <PresenceHomeBar absence={absence} />
    </section>
  );
}
