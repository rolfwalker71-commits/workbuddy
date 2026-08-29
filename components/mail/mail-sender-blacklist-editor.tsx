"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { MailSenderBlacklistEntry } from "@/lib/mail/sender-blacklist";
import { SYSTEM_MAIL_HIDE_NOTE } from "@/lib/mail/sender-blacklist";

type BlacklistPayload = {
  entries: MailSenderBlacklistEntry[];
  systemNote?: string;
};

async function fetchBlacklist(): Promise<BlacklistPayload> {
  const res = await fetch("/api/me/mail-blacklist");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error || "Blacklist laden fehlgeschlagen"
    );
  }
  return json as BlacklistPayload;
}

function BlacklistBody({
  entries,
  systemNote,
  busyEmail,
  error,
  onRemove,
}: {
  entries: MailSenderBlacklistEntry[];
  systemNote: string;
  busyEmail: string | null;
  error: string | null;
  onRemove: (email: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-snug text-muted-foreground">
        Ausgeblendete Absender fehlen in der Mail-Chronik und in der
        AI-Tagesanalyse. Nur für dich.
      </p>
      <p className="text-xs leading-snug text-muted-foreground">{systemNote}</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine eigenen Absender. Öffne eine Mail und tippe «Absender
          ausblenden».
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.email}
              className="flex items-center justify-between gap-3 rounded-2xl bg-card px-3.5 py-2.5 shadow-sm ring-1 ring-foreground/10"
            >
              <div className="min-w-0">
                {entry.name ? (
                  <p className="break-words text-sm font-medium leading-snug">
                    {entry.name}
                  </p>
                ) : null}
                <p className="break-words text-xs text-muted-foreground">
                  {entry.email}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 gap-1.5"
                disabled={busyEmail === entry.email}
                onClick={() => onRemove(entry.email)}
              >
                <Trash2 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function useMailSenderBlacklist() {
  const [entries, setEntries] = useState<MailSenderBlacklistEntry[]>([]);
  const [systemNote, setSystemNote] = useState(SYSTEM_MAIL_HIDE_NOTE);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchBlacklist();
      setEntries(data.entries || []);
      if (data.systemNote) setSystemNote(data.systemNote);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (input: { email: string; name?: string | null }) => {
      const res = await fetch("/api/me/mail-blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "Ausblenden fehlgeschlagen"
        );
      }
      setEntries((json as BlacklistPayload).entries || []);
      return json as BlacklistPayload;
    },
    []
  );

  const remove = useCallback(async (email: string) => {
    setBusyEmail(email);
    try {
      const res = await fetch(
        `/api/me/mail-blacklist?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "Entfernen fehlgeschlagen"
        );
      }
      setEntries((json as BlacklistPayload).entries || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyEmail(null);
    }
  }, []);

  return {
    entries,
    emails: entries.map((e) => e.email),
    systemNote,
    error,
    busyEmail,
    reload,
    add,
    remove,
  };
}

export function MailSenderBlacklistEditor({
  list,
  onChanged,
}: {
  list: ReturnType<typeof useMailSenderBlacklist>;
  onChanged?: () => void;
}) {
  return (
    <BlacklistBody
      entries={list.entries}
      systemNote={list.systemNote}
      busyEmail={list.busyEmail}
      error={list.error}
      onRemove={(email) => {
        void list.remove(email).then(() => onChanged?.());
      }}
    />
  );
}

export function MailSenderBlacklistAccountPanel() {
  const list = useMailSenderBlacklist();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mail-Absender ausblenden</CardTitle>
      </CardHeader>
      <CardContent>
        <MailSenderBlacklistEditor list={list} />
      </CardContent>
    </Card>
  );
}

export function MailSenderBlacklistSheet({
  open,
  onOpenChange,
  list,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ReturnType<typeof useMailSenderBlacklist>;
  onChanged?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ausgeblendete Absender</SheetTitle>
          <SheetDescription>
            Chronik und AI-Tagesanalyse nutzen dieselbe Liste.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <MailSenderBlacklistEditor list={list} onChanged={onChanged} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MailSenderBlacklistOpenButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 gap-1.5"
      onClick={onClick}
    >
      <EyeOff className="size-3.5" strokeWidth={APP_ICON_STROKE} />
      Ausgeblendet
    </Button>
  );
}
