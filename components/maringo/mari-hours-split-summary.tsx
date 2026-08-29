"use client";

import { HoursSplitBagel } from "@/components/ui/hours-split-bagel";
import {
  HOURS_BAGEL_BILLABLE,
  HOURS_BAGEL_WORKED,
} from "@/lib/mari/donut-colors";
import { formatBookHours } from "@/lib/mari/time-book-hours";
import { formatOvertimeHours } from "@/lib/mari/timekeeping-overtime-shared";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";

export function MariHoursSplitSummary({
  totalHours,
  billableHours,
  lineCount,
  footnote,
  overtimeHours = null,
  overtimeHint = null,
  className,
  totalHint,
}: {
  totalHours: number;
  billableHours: number;
  /** @deprecated remainder model — ignored */
  nonBillableHours?: number;
  lineCount?: number;
  /** Überschreibt den Standard-Hinweis unter den KPIs. */
  footnote?: string;
  /** Untertitel unter «Geleistet». */
  totalHint?: string | null;
  /** Maringo Tag-grid Überstunden (running saldo). Hidden when null. */
  overtimeHours?: number | null;
  overtimeHint?: string | null;
  className?: string;
}) {
  const t = useT();
  const resolvedHint = totalHint === undefined ? t("timekeeping.period") : totalHint;
  const hint =
    footnote ??
    (lineCount != null
      ? lineCount === 1
        ? t("timekeeping.bookingsOnTicket", { count: lineCount })
        : t("timekeeping.bookingsOnTicketPlural", { count: lineCount })
      : null);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2",
        className
      )}
    >
      <HoursSplitBagel worked={totalHours} billable={billableHours} size="lg" />

      <div className="min-w-0 flex-1 space-y-1">
        <div
          className={cn(
            "grid gap-1.5",
            overtimeHours != null ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
          )}
        >
          <div className="rounded-md border border-border/60 bg-background/80 px-1.5 py-1">
            <p className="flex items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: HOURS_BAGEL_WORKED }}
                aria-hidden
              />
              {t("timekeeping.worked")}
            </p>
            <p className="mt-0.5 text-[0.8125rem] font-black tabular-nums leading-none text-foreground">
              {formatBookHours(totalHours)}
              <span className="ml-0.5 text-[0.625rem] font-semibold text-muted-foreground">
                h
              </span>
            </p>
            {resolvedHint ? (
              <p className="mt-px text-[0.5625rem] text-muted-foreground">
                {resolvedHint}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-emerald-200/70 bg-emerald-50/60 px-1.5 py-1 dark:border-emerald-400/30 dark:bg-emerald-500/12">
            <p className="flex items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-emerald-900/80">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: HOURS_BAGEL_BILLABLE }}
                aria-hidden
              />
              {t("timekeeping.billable")}
            </p>
            <p className="mt-0.5 text-[0.8125rem] font-black tabular-nums leading-none text-emerald-950">
              {formatBookHours(billableHours)}
              <span className="ml-0.5 text-[0.625rem] font-semibold text-emerald-800/80">
                h
              </span>
            </p>
          </div>
          {overtimeHours != null ? (
            <div
              className={cn(
                "col-span-2 rounded-md border px-1.5 py-1 sm:col-span-1",
                overtimeHours < 0
                  ? "border-rose-200/70 bg-rose-50/60 dark:border-rose-400/30 dark:bg-rose-500/12"
                  : overtimeHours > 0
                    ? "border-amber-200/70 bg-amber-50/60 dark:border-amber-400/30 dark:bg-amber-500/12"
                    : "border-border/60 bg-background/80"
              )}
            >
              <p
                className={cn(
                  "text-[0.5625rem] font-semibold uppercase tracking-wide",
                  overtimeHours < 0
                    ? "text-rose-900/80 dark:text-rose-100"
                    : overtimeHours > 0
                      ? "text-amber-950/80 dark:text-amber-100"
                      : "text-muted-foreground"
                )}
              >
                {t("timekeeping.overtime")}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[0.8125rem] font-black tabular-nums leading-none",
                  overtimeHours < 0
                    ? "text-rose-950 dark:text-rose-50"
                    : overtimeHours > 0
                      ? "text-amber-950 dark:text-amber-50"
                      : "text-foreground"
                )}
              >
                {formatOvertimeHours(overtimeHours)}
                <span className="ml-0.5 text-[0.625rem] font-semibold opacity-70">
                  h
                </span>
              </p>
              {overtimeHint ? (
                <p className="mt-px text-[0.5625rem] text-muted-foreground">
                  {overtimeHint}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {hint ? (
          <p className="text-[0.625rem] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
