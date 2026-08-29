"use client";

import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";
import type { MailThreadCoverage } from "@/lib/mail/mail-threads";

/**
 * Explains that day analysis / chronik loads full conversations beyond Von–Bis.
 */
export function MailAnalysisThreadHint({
  coverage,
  clusterCount,
  className,
  compact,
}: {
  coverage?: MailThreadCoverage | null;
  /** Clusters returned by the current analysis (for coverage check). */
  clusterCount?: number | null;
  className?: string;
  /** Smaller inline line under the analysis card title. */
  compact?: boolean;
}) {
  const t = useT();
  const hasCoverage = coverage && coverage.total > 0;
  const stats =
    hasCoverage &&
    t("mail.inRange", { count: coverage.inRange }) +
      (coverage.context > 0
        ? t("mail.extraContext", { count: coverage.context })
        : t("mail.noExtraContext")) +
      t(
        coverage.threads === 1 ? "mail.threadCount" : "mail.threadCountPlural",
        { count: coverage.threads }
      ) +
      (coverage.threadsWithContext > 0
        ? t("mail.threadsWithHistory", { count: coverage.threadsWithContext })
        : "");

  const clusterLine =
    typeof clusterCount === "number" && hasCoverage
      ? t("mail.clusterCountPlural", { count: clusterCount }) +
        (coverage.threads > 0
          ? t("mail.clusterTarget", { count: coverage.threads })
          : "")
      : typeof clusterCount === "number"
        ? t("mail.clusterCountPlural", { count: clusterCount })
        : null;

  if (compact) {
    return (
      <p
        className={cn(
          "text-xs leading-snug text-muted-foreground",
          className
        )}
      >
        {t("mail.threadsCompact", {
          stats: stats ? ` — ${stats}` : "",
          clusters: clusterLine ? ` · ${clusterLine}` : "",
        })}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-[0.8125rem] leading-snug text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/12 dark:text-sky-100",
        className
      )}
      role="note"
    >
      <MessagesSquare
        className="mt-0.5 size-4 shrink-0 text-sky-800"
        strokeWidth={APP_ICON_STROKE}
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold tracking-tight">
          {t("mail.threadsTitle")}
        </p>
        <p className="text-xs text-sky-950/85">
          {t("mail.threadsBody")}
        </p>
        {stats ? (
          <p className="text-xs font-medium tabular-nums text-sky-900">
            {t("mail.loadedStats", {
              stats,
              analysis: clusterLine
                ? t("mail.analysisColon", { line: clusterLine })
                : "",
            })}
          </p>
        ) : (
          <p className="text-xs text-sky-900/70">
            {t("mail.waitForStats")}
          </p>
        )}
      </div>
    </div>
  );
}
