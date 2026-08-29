"use client";

import { HoursSplitBagel } from "@/components/ui/hours-split-bagel";
import { formatBookHours } from "@/lib/mari/time-book-hours";
import { cn } from "@/lib/utils";

const WORKED_COLOR = "#64748b";
const BILLABLE_COLOR = "#047857";

export function MariHoursSplitSummary({
  totalHours,
  billableHours,
  lineCount,
  footnote,
  totalHint = "Zeitraum",
  className,
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
  className?: string;
}) {
  const hint =
    footnote ??
    (lineCount != null
      ? `${lineCount} Buchung${lineCount === 1 ? "" : "en"} auf diesem Ticket`
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
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-md border border-border/60 bg-background/80 px-1.5 py-1">
            <p className="flex items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: WORKED_COLOR }}
                aria-hidden
              />
              Geleistet
            </p>
            <p className="mt-0.5 text-[0.8125rem] font-black tabular-nums leading-none text-foreground">
              {formatBookHours(totalHours)}
              <span className="ml-0.5 text-[0.625rem] font-semibold text-muted-foreground">
                h
              </span>
            </p>
            {totalHint ? (
              <p className="mt-px text-[0.5625rem] text-muted-foreground">
                {totalHint}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-emerald-200/70 bg-emerald-50/60 px-1.5 py-1 dark:border-emerald-400/30 dark:bg-emerald-500/12">
            <p className="flex items-center gap-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-emerald-900/80">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: BILLABLE_COLOR }}
                aria-hidden
              />
              Verrechenbar
            </p>
            <p className="mt-0.5 text-[0.8125rem] font-black tabular-nums leading-none text-emerald-950">
              {formatBookHours(billableHours)}
              <span className="ml-0.5 text-[0.625rem] font-semibold text-emerald-800/80">
                h
              </span>
            </p>
          </div>
        </div>
        {hint ? (
          <p className="text-[0.625rem] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
