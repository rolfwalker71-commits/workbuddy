import { formatTokenUsageLine } from "@/lib/ai/usage-cost";
import { plainDaySummaryPreview } from "@/lib/mail/day-summary-display";
import type { MsDayMailAnalysis } from "@/lib/microsoft/analyze-mail-day";

/** Kompakte Cache-Zeile für die Tagesanalysen-Liste (ohne volle Analyse). */
export type MailDayCachedSummary = {
  rangeKey: string;
  fromYmd: string;
  toYmd: string;
  finishedAt: string;
  inboxCount: number;
  sentCount: number;
  daySummary: string;
  clusterCount: number;
  taskCount: number;
  replyCount: number;
  model: string | null;
  usageLine: string | null;
  provider?: "microsoft";
};

export function toMailDayCachedSummary(entry: {
  rangeKey: string;
  fromYmd: string;
  toYmd: string;
  finishedAt: string;
  inboxCount: number;
  sentCount: number;
  analysis: MsDayMailAnalysis;
}): MailDayCachedSummary {
  const a = entry.analysis;
  return {
    rangeKey: entry.rangeKey,
    fromYmd: entry.fromYmd,
    toYmd: entry.toYmd,
    finishedAt: entry.finishedAt,
    inboxCount: entry.inboxCount,
    sentCount: entry.sentCount,
    daySummary: plainDaySummaryPreview(a.daySummary || "", 280),
    clusterCount: a.clusters?.length || 0,
    taskCount: a.tasks?.length || 0,
    replyCount: a.replies?.length || 0,
    model: a.usage?.model || null,
    usageLine: formatTokenUsageLine(a.usage),
  };
}
