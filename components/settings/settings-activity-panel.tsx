"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  LogIn,
  LogOut,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
  segmentedTriggerProps,
} from "@/components/layout/segmented-control";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { formatSwissDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import {
  formatActivityDetail,
  type ActivityEventValue,
} from "@/lib/users/activity-log-display";
import {
  ACTIVITY_LOG_PAGE_SIZE,
  activityLogDefaultRange,
  activityLogRetentionFrom,
  clampActivityLogRange,
} from "@/lib/users/activity-log-range";
import { zurichYmd } from "@/lib/microsoft/time";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { activityEventDisplayLabel } from "@/lib/i18n/display";

type ActivityItem = {
  id: number;
  userId: number | null;
  username: string;
  event: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type FilterValue = "" | ActivityEventValue;

const FILTER_ICONS: { value: FilterValue; icon: LucideIcon }[] = [
  { value: "", icon: List },
  { value: "login", icon: LogIn },
  { value: "logout", icon: LogOut },
  { value: "session_expired", icon: Clock },
  { value: "ticket_analysis", icon: Ticket },
  { value: "mail_day_analysis", icon: Sparkles },
];

export function SettingsActivityPanel() {
  const t = useT();
  const { locale } = useLocale();
  const today = useMemo(() => zurichYmd(), []);
  const minDate = useMemo(() => activityLogRetentionFrom(today), [today]);
  const initial = useMemo(() => activityLogDefaultRange(today), [today]);

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [event, setEvent] = useState<FilterValue>("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyRange = useCallback((nextFrom: string, nextTo: string) => {
    const clamped = clampActivityLogRange({ from: nextFrom, to: nextTo });
    if ("error" in clamped) return;
    setFrom(clamped.from);
    setTo(clamped.to);
    setOffset(0);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      from,
      to,
      limit: String(ACTIVITY_LOG_PAGE_SIZE),
      offset: String(offset),
    });
    if (event) params.set("event", event);

    void fetch(`/api/admin/activity?${params}`, { signal: ac.signal })
      .then(async (res) => {
        const json = (await res.json()) as {
          items?: ActivityItem[];
          total?: number;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error || t("settings.activityLoadFailed"));
        }
        setItems(json.items || []);
        setTotal(Number(json.total ?? 0));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [from, to, event, offset, t]);

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + items.length, total);
  const canPrev = offset > 0;
  const canNext = offset + items.length < total;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("activity.title")}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("settings.activityHint")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="activity-from">{t("common.from")}</Label>
            <Input
              id="activity-from"
              type="date"
              min={minDate}
              max={today}
              value={from}
              onChange={(e) => applyRange(e.target.value, to)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-to">{t("common.until")}</Label>
            <Input
              id="activity-to"
              type="date"
              min={minDate}
              max={today}
              value={to}
              onChange={(e) => applyRange(from, e.target.value)}
            />
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto px-1">
          <div
            className={cn(segmentedTrackClass, "flex-nowrap")}
            role="radiogroup"
            aria-label={t("settings.filterEvents")}
          >
            {FILTER_ICONS.map((filter) => {
              const active = event === filter.value;
              const Icon = filter.icon;
              const label = filter.value
                ? activityEventDisplayLabel(filter.value, locale)
                : t("common.all");
              return (
                <Button
                  key={filter.value || "all"}
                  type="button"
                  variant="ghost"
                  role="radio"
                  aria-checked={active}
                  {...segmentedTriggerProps}
                  className={cn(
                    segmentedTriggerClass(active),
                    "shrink-0"
                  )}
                  onClick={() => {
                    setEvent(filter.value);
                    setOffset(0);
                  }}
                >
                  <Icon
                    className="size-4 shrink-0"
                    strokeWidth={APP_ICON_STROKE}
                    aria-hidden
                  />
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div aria-busy={loading} aria-live="polite">
          {loading && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.loadingActivity")}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.activityEmpty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.time")}</TableHead>
                  <TableHead>{t("settings.user")}</TableHead>
                  <TableHead>{t("settings.event")}</TableHead>
                  <TableHead>{t("settings.shortDetail")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatSwissDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="break-words font-medium">
                      {row.username || t("common.dash")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {activityEventDisplayLabel(row.event, locale)}
                    </TableCell>
                    <TableCell className="break-words text-muted-foreground">
                      {formatActivityDetail({ ...row, locale })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? t("settings.entriesZero")
              : t("settings.entriesRange", {
                  start: rangeStart,
                  end: rangeEnd,
                  total,
                })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11"
              disabled={!canPrev || loading}
              onClick={() =>
                setOffset((prev) => Math.max(0, prev - ACTIVITY_LOG_PAGE_SIZE))
              }
            >
              <ChevronLeft className="size-4" aria-hidden />
              {t("common.back")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11"
              disabled={!canNext || loading}
              onClick={() => setOffset((prev) => prev + ACTIVITY_LOG_PAGE_SIZE)}
            >
              {t("common.next")}
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
