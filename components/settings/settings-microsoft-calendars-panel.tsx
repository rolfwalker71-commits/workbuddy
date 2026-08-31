"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronDown, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconCircle } from "@/components/layout/icon-circle";
import {
  ICS_CALENDAR_TYPES,
  ICS_TYPE_META,
  isWorkCalendarType,
  normalizeIcsCalendarType,
  type IcsCalendarType,
} from "@/lib/calendar/ics-types";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { icsTypeDisplayLabel } from "@/lib/i18n/display";

type CalType = IcsCalendarType;

type MsCal = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  primary: boolean;
  accessRole: string | null;
  suggestedType: string;
  selected: boolean;
  enabled: boolean;
  type: string;
  planningRelevant?: boolean;
};

type TypeMeta = { id: CalType; label: string; defaultColor: string };

const PRESET_COLORS = [
  "#e11d48",
  "#2563eb",
  "#78836c",
  "#7c3aed",
  "#ea580c",
  "#db2777",
  "#ec4899",
  "#0f766e",
  "#0d9488",
  "#8b5cf6",
  "#0369a1",
  "#64748b",
  "#ca8a04",
];

const FALLBACK_TYPES: TypeMeta[] = ICS_CALENDAR_TYPES.map((id) => ({
  id,
  label: ICS_TYPE_META[id].label,
  defaultColor: ICS_TYPE_META[id].defaultColor,
}));

type DraftRow = {
  on: boolean;
  type: CalType;
  color: string;
  planningRelevant: boolean;
};

export function SettingsMicrosoftCalendarsPanel() {
  const t = useT();
  const { locale } = useLocale();
  const [calendars, setCalendars] = useState<MsCal[]>([]);
  const [types, setTypes] = useState<TypeMeta[]>(FALLBACK_TYPES);
  const [connected, setConnected] = useState(false);
  const [hasCalendarScope, setHasCalendarScope] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gRes, icsRes] = await Promise.all([
        fetch("/api/microsoft/calendars"),
        fetch("/api/calendars"),
      ]);
      const json = await gRes.json();
      const icsJson = await icsRes.json().catch(() => ({}));
      if (!gRes.ok && !json.calendars) {
        throw new Error(json.error || t("settings.msCalLoadFailed"));
      }
      if (Array.isArray(icsJson.types) && icsJson.types.length > 0) {
        setTypes(icsJson.types as TypeMeta[]);
      }
      setConnected(Boolean(json.connected));
      setHasCalendarScope(Boolean(json.hasCalendarScope));
      const list = (json.calendars || []) as MsCal[];
      setCalendars(list);
      const next: Record<string, DraftRow> = {};
      for (const c of list) {
        const type =
          normalizeIcsCalendarType(c.type || c.suggestedType) || "other";
        next[c.id] = {
          on: Boolean(c.selected && c.enabled),
          type,
          color: c.color || "#64748b",
          planningRelevant: c.planningRelevant !== false,
        };
      }
      setDraft(next);
      if (json.error) setError(String(json.error));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchDraft(id: string, patch: Partial<DraftRow>) {
    setDraft((prev) => {
      const cur = prev[id] || {
        on: false,
        type: "other" as CalType,
        color: "#64748b",
        planningRelevant: true,
      };
      const next = { ...cur, ...patch };
      if (patch.type && !patch.color) {
        const meta = types.find((t) => t.id === patch.type);
        if (meta) next.color = meta.defaultColor;
      }
      return { ...prev, [id]: next };
    });
    setStatus(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const selections = calendars
        .filter((c) => draft[c.id]?.on)
        .map((c) => {
          const d = draft[c.id]!;
          return {
            id: c.id,
            enabled: true,
            name: c.name,
            type: d.type,
            color: d.color,
            planningRelevant: d.planningRelevant,
          };
        });
      const res = await fetch("/api/microsoft/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("common.saveFailed"));
      const list = (json.calendars || []) as MsCal[];
      setCalendars(list);
      const next: Record<string, DraftRow> = {};
      for (const c of list) {
        const type =
          normalizeIcsCalendarType(c.type || c.suggestedType) || "other";
        next[c.id] = {
          on: Boolean(c.selected && c.enabled),
          type,
          color: c.color || "#64748b",
          planningRelevant: c.planningRelevant !== false,
        };
      }
      setDraft(next);
      setStatus(t("settings.msCalSaved", { count: selections.length }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const dirty = useMemo(() => {
    return calendars.some((c) => {
      const d = draft[c.id];
      if (!d) return false;
      const wasOn = Boolean(c.selected && c.enabled);
      const wasType =
        normalizeIcsCalendarType(c.type || c.suggestedType) || "other";
      const wasColor = c.color || "#64748b";
      const wasPlanning = c.planningRelevant !== false;
      return (
        d.on !== wasOn ||
        (d.on &&
          (d.type !== wasType ||
            d.color !== wasColor ||
            d.planningRelevant !== wasPlanning))
      );
    });
  }, [calendars, draft]);

  const activeCount = useMemo(
    () => calendars.filter((c) => draft[c.id]?.on).length,
    [calendars, draft]
  );

  const collapsedHint = loading
    ? t("settings.calLoading")
    : !connected
      ? t("closeout.notConnected")
      : !hasCalendarScope
        ? t("settings.rightMissing")
        : t("settings.activeCount", { count: activeCount });

  return (
    <Card>
      <CardHeader className="pb-4">
        <Button
          type="button"
          variant="ghost"
          className="flex h-auto w-full items-center gap-3 rounded-md p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <CardTitle className="flex min-w-0 flex-1 items-center gap-3">
            <IconCircle icon={CalendarRange} tone="blue" size="sm" />
            <span className="min-w-0 flex-1 truncate">
              {t("settings.msCalendars")}
            </span>
            {!open ? (
              <span className="shrink-0 text-sm font-normal text-muted-foreground">
                {collapsedHint}
              </span>
            ) : null}
          </CardTitle>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
            aria-hidden
          />
        </Button>
      </CardHeader>
      {open ? (
      <CardContent className="space-y-4 pt-0">
        <p className="text-sm text-muted-foreground">
          {t("settings.msCalHint")}
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !connected ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              {t("settings.noMsYet")}
            </p>
            <a
              href="/api/microsoft/oauth/start"
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              <Link2 className="size-3.5" />
              {t("settings.connectMsShort")}
            </a>
          </div>
        ) : !hasCalendarScope ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              {t("settings.noCalScope")}
            </p>
            <a
              href="/api/microsoft/oauth/start"
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              <Link2 className="size-3.5" />
              {t("settings.reconnectCal")}
            </a>
          </div>
        ) : (
          <>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="text-sm text-emerald-700" role="status">
                {status}
              </p>
            ) : null}

            {calendars.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.noCalsFromMs")}
              </p>
            ) : (
              <ul className="space-y-3">
                {calendars.map((c) => {
                  const d = draft[c.id] || {
                    on: false,
                    type: "other" as CalType,
                    color: c.color,
                    planningRelevant: true,
                  };
                  return (
                    <li
                      key={c.id}
                      className="rounded-xl border border-border/70 bg-card p-3"
                      style={{
                        borderLeftWidth: 4,
                        borderLeftColor: d.color,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 rounded border"
                          checked={d.on}
                          disabled={saving}
                          onChange={(e) =>
                            patchDraft(c.id, { on: e.target.checked })
                          }
                          aria-label={t("settings.showInBuddy", { name: c.name })}
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{c.name}</p>
                            {c.primary ? (
                              <Badge
                                variant="secondary"
                                className="text-[0.625rem]"
                              >
                                {t("common.primary")}
                              </Badge>
                            ) : null}
                            {d.on && !d.planningRelevant ? (
                              <Badge variant="outline" className="text-[0.625rem]">
                                {t("settings.referenceOnly")}
                              </Badge>
                            ) : null}
                          </div>
                          {d.on ? (
                            <div className="space-y-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("common.type")}</Label>
                                <Select
                                  value={d.type}
                                  onValueChange={(v) =>
                                    patchDraft(c.id, {
                                      type: v as CalType,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {types.map((typeRow) => (
                                      <SelectItem key={typeRow.id} value={typeRow.id}>
                                        {icsTypeDisplayLabel(typeRow.id, locale, typeRow.label)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("common.color")}</Label>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {PRESET_COLORS.map((hex) => (
                                    <Button
                                      key={hex}
                                      type="button"
                                      variant="ghost"
                                      className="size-6 rounded-full border border-black/10 p-0 hover:bg-transparent"
                                      style={{
                                        backgroundColor: hex,
                                        boxShadow:
                                          d.color === hex
                                            ? `0 0 0 2px ${hex}`
                                            : undefined,
                                      }}
                                      aria-label={hex}
                                      onClick={() =>
                                        patchDraft(c.id, { color: hex })
                                      }
                                    />
                                  ))}
                                  <Input
                                    type="color"
                                    value={d.color}
                                    onChange={(e) =>
                                      patchDraft(c.id, {
                                        color: e.target.value,
                                      })
                                    }
                                    className="h-7 w-10 cursor-pointer p-0.5"
                                  />
                                </div>
                              </div>
                              </div>
                              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 size-4 rounded border"
                                  checked={d.planningRelevant}
                                  disabled={saving}
                                  onChange={(e) =>
                                    patchDraft(c.id, {
                                      planningRelevant: e.target.checked,
                                    })
                                  }
                                />
                                <span>
                                  {t("settings.planningRelevant")}
                                  <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground/90">
                                    {t("settings.planningOffHint")}
                                  </span>
                                </span>
                              </label>
                            </div>
                          ) : null}
                          {d.on && isWorkCalendarType(d.type) ? (
                            <p className="text-[0.6875rem] text-muted-foreground">
                              {t("settings.workHint")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void save()}
              >
                {t("settings.saveSelection")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void load()}
              >
                {t("common.reload")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
      ) : null}
    </Card>
  );
}
