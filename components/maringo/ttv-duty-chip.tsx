"use client";

import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";

type DutyPayload = {
  today: string;
  todayDuty: { userId: number; displayName: string } | null;
  isMe: boolean;
  ttvInboxHref: string;
  error?: string;
};

export function TtvDutyChip({
  onOpenInbox,
}: {
  onOpenInbox: () => void;
}) {
  const [data, setData] = useState<DutyPayload | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/maringo/ttv-duty")
      .then(async (res) => {
        const json = (await res.json()) as DutyPayload;
        if (res.ok) setData(json);
      })
      .catch(() => undefined);
  }, []);

  async function claim() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch("/api/maringo/ttv-duty", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ymd: data.today, claim: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Übernehmen fehlgeschlagen");
      setData((prev) =>
        prev
          ? {
              ...prev,
              todayDuty: json.todayDuty || json.entry,
              isMe: true,
            }
          : prev
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  return (
    <div
      className="flex min-h-10 max-w-full flex-wrap items-center gap-1.5 rounded-full bg-orange-50 px-2.5 dark:bg-orange-950"
      title="Dienst ist wer den Tag hat. Filter TTV bleibt der Fallback für NEU-Tickets, auch ohne Dienst."
    >
      <p className="min-w-0 text-[0.75rem] font-semibold leading-none text-orange-950 dark:text-orange-100">
        TTV heute: {data.todayDuty?.displayName || "noch niemand"}
      </p>
      {!data.isMe ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => void claim()}
        >
          Übernehmen
        </Button>
      ) : (
        <span className="text-[0.625rem] font-semibold leading-none text-orange-800 dark:text-orange-200">
          Du
        </span>
      )}
      <Button type="button" size="xs" variant="ghost" onClick={onOpenInbox}>
        <Inbox className="size-3" strokeWidth={APP_ICON_STROKE} />
        Inbox
      </Button>
    </div>
  );
}
