"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  groupFreeSlotsByDate,
  SLOT_DURATION_PRESETS,
} from "@/lib/calendar/slot-duration";
import { cn } from "@/lib/utils";
import { weekdayLabel } from "@/lib/utils/weekday";
import { formatSwissDate } from "@/lib/utils/dates";
import { useLocale, useT } from "@/components/i18n/locale-provider";

type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
};

export function AdhocEventDialog({
  open,
  onOpenChange,
  onCreated,
  initialTitle,
  initialNotes,
  mariIssueId,
  dialogTitle,
  dialogDescription,
  defaultDurationMinutes = 60,
  providerScope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** Prefill when opening (e.g. from Maringo ticket). */
  initialTitle?: string | null;
  initialNotes?: string | null;
  mariIssueId?: number | null;
  dialogTitle?: string;
  dialogDescription?: string;
  defaultDurationMinutes?: number;
  /** When set, only that cloud’s calendars appear as targets. */
  providerScope?: "microsoft" | "google";
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [startHm, setStartHm] = useState("09:00");
  const [endHm, setEndHm] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [duration, setDuration] = useState(60);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [targets, setTargets] = useState<
    Array<{
      provider: "microsoft" | "google";
      id: string;
      name: string;
      primary: boolean;
    }>
  >([]);
  const t = useT();
  const { intlLocale } = useLocale();
  const [targetKey, setTargetKey] = useState<string>("");

  const isMari = mariIssueId != null && mariIssueId > 0;
  const selectedTarget = targets.find(
    (t) => `${t.provider}:${t.id}` === targetKey
  );
  const teamsMeeting = selectedTarget?.provider !== "google" && !allDay;

  function reset() {
    setTitle("");
    setNotes("");
    setLocation("");
    setDate("");
    setStartHm("09:00");
    setEndHm("10:00");
    setAllDay(false);
    setDuration(defaultDurationMinutes);
    setSlots([]);
    setError(null);
    setMsg(null);
    setBusy(false);
    setProviderLabel(null);
    setTargetKey("");
  }

  useEffect(() => {
    if (!open) return;
    setTitle((initialTitle || "").trim());
    setNotes((initialNotes || "").trim());
    setLocation("");
    setDate(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Zurich",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    );
    setStartHm("09:00");
    setEndHm("10:00");
    setAllDay(false);
    setDuration(defaultDurationMinutes);
    setSlots([]);
    setError(null);
    setMsg(null);
    setBusy(false);
    setProviderLabel(null);
    const qs = providerScope
      ? `?provider=${encodeURIComponent(providerScope)}`
      : "";
    void fetch(`/api/calendar/adhoc${qs}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const raw = (data.targets || []) as typeof targets;
        const next = providerScope
          ? raw.filter((t) => t.provider === providerScope)
          : raw;
        setTargets(next);
        setTargetKey((prev) => {
          if (prev && next.some((t) => `${t.provider}:${t.id}` === prev)) {
            return prev;
          }
          const primary = next.find((t) => t.primary) || next[0];
          return primary ? `${primary.provider}:${primary.id}` : "";
        });
      })
      .catch(() => {
        setTargets([]);
      });
  }, [
    open,
    initialTitle,
    initialNotes,
    defaultDurationMinutes,
    mariIssueId,
    isMari,
    providerScope,
  ]);

  async function suggestSlots() {
    setBusy(true);
    setError(null);
    setMsg(null);
    setSlots([]);
    try {
      const res = await fetch("/api/calendar/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest_slots",
          durationMinutes: duration,
          rangeDays: 7,
          provider: selectedTarget?.provider || "auto",
          calendarId: selectedTarget?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("common.searchSlotsFailed"));
      }
      const next = (data.slots || []) as FreeSlot[];
      setSlots(next);
      const prov =
        data.provider === "google"
          ? "Google"
          : data.provider === "microsoft"
            ? "Outlook"
            : null;
      setProviderLabel(prov);
      setMsg(
        next.length
          ? t("calendarUi.freeSlotsFound", {
              count: next.length,
              provider: prov ? ` · ${prov}` : "",
            })
          : t("common.noFreeSlots")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createInSlot(slot: FreeSlot) {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("common.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: trimmed,
          date: slot.date,
          startHm: slot.startHm,
          endHm: slot.endHm,
          allDay: false,
          location: location.trim() || null,
          notes: notes.trim() || null,
          mariIssueId: isMari ? mariIssueId : null,
          teamsMeeting,
          provider: selectedTarget?.provider || "auto",
          calendarId: selectedTarget?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("calendarUi.createFailed"));
      }
      const prov =
        data.provider === "google"
          ? "Google"
          : data.provider === "microsoft"
            ? "Outlook"
            : t("workspace.calendar");
      const teamsHint =
        data.provider === "microsoft" && data.teamsMeeting
          ? t("calendarUi.teamsMeetingHint")
          : "";
      setMsg(
        t("calendarUi.inserted", {
          provider: `${prov}${teamsHint}`,
          title: trimmed,
          when: `${formatSwissDate(slot.date)} ${slot.startHm}–${slot.endHm}`,
        })
      );
      onCreated?.();
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createManual() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("common.titleRequired"));
      return;
    }
    if (!date) {
      setError(t("common.dateRequired"));
      return;
    }
    if (!allDay && (!startHm || !endHm)) {
      setError(t("calendarUi.chooseTimesOrAllDay"));
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: trimmed,
          date,
          startHm: allDay ? null : startHm,
          endHm: allDay ? null : endHm,
          allDay,
          location: location.trim() || null,
          notes: notes.trim() || null,
          mariIssueId: isMari ? mariIssueId : null,
          teamsMeeting: allDay ? false : teamsMeeting,
          provider: selectedTarget?.provider || "auto",
          calendarId: selectedTarget?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("calendarUi.createFailed"));
      }
      onCreated?.();
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus
              className="size-4 text-teal-700"
              strokeWidth={APP_ICON_STROKE}
              absoluteStrokeWidth
              aria-hidden
            />
            {dialogTitle ||
              (isMari
                ? t("calendarUi.ticketEvent", { id: mariIssueId })
                : t("calendarUi.planAdhoc"))}
          </DialogTitle>
          <DialogDescription>
            {dialogDescription ||
              (isMari
                ? t("calendarUi.mariHint")
                : t("calendarUi.adhocHint"))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adhoc-title">{t("common.title")}</Label>
            <Input
              id="adhoc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("calendarUi.titlePlaceholder")}
              maxLength={200}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adhoc-location">{t("common.locationOptional")}</Label>
            <Input
              id="adhoc-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("calendarUi.locationPlaceholder")}
              maxLength={300}
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-date">{t("common.date")}</Label>
              <Input
                id="adhoc-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
              />
            </div>
            <label className="flex items-end gap-2 pb-1 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-teal-700"
                checked={allDay}
                disabled={busy}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              {t("calendarUi.allDay")}
            </label>
          </div>

          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="adhoc-start">{t("common.from")}</Label>
                <Input
                  id="adhoc-start"
                  type="time"
                  value={startHm}
                  onChange={(e) => setStartHm(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adhoc-end">{t("common.until")}</Label>
                <Input
                  id="adhoc-end"
                  type="time"
                  value={endHm}
                  onChange={(e) => setEndHm(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          ) : null}

          <Button
            type="button"
            variant="default"
            disabled={busy || !title.trim() || !date}
            onClick={() => void createManual()}
            className="w-full"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("calendarUi.insertEvent")}
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="adhoc-notes">
              {isMari ? t("common.descriptionMemo") : t("common.notesOptional")}
            </Label>
            {isMari ? (
              <Textarea
                id="adhoc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("calendarUi.ticketSummaryPlaceholder")}
                maxLength={4000}
                rows={5}
                disabled={busy}
                className="resize-y text-[0.8125rem]"
              />
            ) : (
              <Input
                id="adhoc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("calendarUi.shortDescription")}
                maxLength={500}
                disabled={busy}
              />
            )}
          </div>

          {targets.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-calendar">{t("calendarUi.targetCalendar")}</Label>
              <select
                id="adhoc-calendar"
                className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm"
                value={targetKey}
                disabled={busy}
                onChange={(e) => {
                  setTargetKey(e.target.value);
                  setSlots([]);
                  setMsg(null);
                }}
              >
                {targets.map((cal) => (
                  <option key={`${cal.provider}:${cal.id}`} value={`${cal.provider}:${cal.id}`}>
                    {cal.provider === "google" ? "Google" : "Outlook"}
                    {" · "}
                    {cal.name}
                    {cal.primary ? ` ${t("common.primaryParen")}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>{t("common.duration")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {SLOT_DURATION_PRESETS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={duration === m ? "default" : "outline"}
                  className="tabular-nums"
                  disabled={busy}
                  onClick={() => {
                    setDuration(m);
                    setSlots([]);
                    setMsg(null);
                  }}
                >
                  {t("common.minutes", { count: m })}
                </Button>
              ))}
            </div>
          </div>

          {selectedTarget?.provider !== "google" && !allDay ? (
            <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-[0.6875rem] leading-snug text-muted-foreground">
              {t("calendarUi.outlookTeamsHint")}
            </p>
          ) : null}

          <Button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void suggestSlots()}
            className="w-full gap-2"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("common.searchSlots")}
          </Button>

          {slots.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("calendarUi.chooseSlotDays", {
                  provider: providerLabel ? ` → ${providerLabel}` : "",
                  duration,
                })}
              </p>
              <div className="max-h-56 space-y-2.5 overflow-y-auto">
                {groupFreeSlotsByDate(slots).map(({ date, slots: daySlots }) => (
                  <div key={date} className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      {weekdayLabel(date, intlLocale)} · {formatSwissDate(date)}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {daySlots.map((s) => (
                        <li key={`${s.date}-${s.startHm}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void createInSlot(s)}
                            className={cn(
                              "h-auto w-full items-center justify-between gap-2 rounded-md border border-border/50 bg-card px-2.5 py-2 text-left text-[0.8125rem] hover:bg-muted/40 disabled:opacity-60"
                            )}
                          >
                            <span className="tabular-nums text-muted-foreground">
                              {s.startHm}–{s.endHm}
                            </span>
                            <span className="text-[0.6875rem] font-medium text-foreground">
                              {t("common.insert")}
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
