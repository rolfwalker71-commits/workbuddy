"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Building2,
  Check,
  Copy,
  Calendar,
  CalendarPlus,
  CalendarRange,
  Clock3,
  EyeOff,
  Flag,
  FolderOpen,
  Inbox,
  ListTodo,
  Loader2,
  Lock,
  Bell,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/layout/page-primitives";
import {
  segmentedTrackClass,
  segmentedTriggerClass,
} from "@/components/layout/segmented-control";
import { MaringoLogo } from "@/components/branding/provider-logos";
import { pageVisuals } from "@/components/layout/icon-circle";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  ALL_STATUS_IDS,
  STATUS_LABELS,
  TICKET_EDIT_STATUS_IDS,
  WORK_STATUS_IDS,
  parseStatusIdsParam,
  resolveRecommendedStatusId,
  statusChipClass,
  statusChipLabel,
  statusDetailHeaderClass,
} from "@/lib/mari/status";
import { cn } from "@/lib/utils";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { formatTicketIdList } from "@/lib/mari/ticket-bulk";
import {
  MariTicketBulkBar,
  MariTicketSelectCheckbox,
} from "@/components/maringo/mari-ticket-bulk-bar";
import { formatSwissDate, formatSwissDateTime } from "@/lib/utils/dates";
import type {
  MariTicketAnalysis,
  MariSolutionArtifact,
} from "@/lib/mari/analyze-ticket-shared";
import {
  artifactKindLabel,
  groupSolutionArtifacts,
} from "@/lib/mari/analyze-ticket-shared";
import type { AiTokenUsage } from "@/lib/ai/usage-cost";
import { formatTokenUsageBreakdownLines } from "@/lib/ai/usage-cost";
import type {
  MariEmployeeOption,
  MariTicketDetail,
  MariTicketListItem,
  MariTimelineAttachment,
  MariTimelineItem,
} from "@/lib/mari/tickets";
import type { MariSupportGroupOption } from "@/lib/mari/ticket-meta";
import {
  firstSupportGroupIdForEmployee,
} from "@/lib/mari/support-group-staff";
import { MariHandlerMultiPicker } from "@/components/maringo/mari-handler-multi-picker";
import {
  MariTicketSavedViewsBar,
  type MariTicketSavedViewChip,
} from "@/components/maringo/mari-ticket-saved-views-bar";
import type { MariCustomerOption } from "@/lib/mari/customers";
import type {
  MariListMetaField,
  MariListSort,
  MariTicketFilterMode,
  MariTimelineSort,
} from "@/lib/mari/ticket-filter-prefs-shared";
import {
  DEFAULT_MARI_LIST_META_FIELDS,
  MARI_LIST_META_FIELD_OPTIONS,
  isMariTicketFilterMode,
  parseMariTicketFilterPrefsPatch,
  readMariTicketFilterPrefsLocal,
  writeMariTicketFilterPrefsLocal,
  type MariTicketFilterPrefsPatch,
} from "@/lib/mari/ticket-filter-prefs-shared";
import { buildMariTicketListMetaItems } from "@/lib/mari/ticket-list-meta";
import {
  filterTicketsByTextQuery,
  parseTicketNumberQuery,
  shouldLookupTicketNumber,
} from "@/lib/mari/ticket-search-shared";
import {
  DEFAULT_TTV_LOOKBACK_DAYS,
  TTV_LOOKBACK_DAYS_MAX,
  TTV_LOOKBACK_DAYS_MIN,
  sanitizeTtvLookbackDays,
  ttvLookbackLabel,
} from "@/lib/mari/ttv";
import { MariCustomerChip } from "@/components/maringo/mari-customer-chip";
import {
  MariMainFlyoutShell,
  MariSecondaryFlyoutShell,
  MariTicketFlyoutRail,
  MARI_FLYOUT_MS,
  MARI_SECONDARY_FLYOUT_COMPACT_WIDTH_CLASS,
  MARI_SECONDARY_FLYOUT_META,
  MARI_SECONDARY_FLYOUT_WIDTH_CLASS,
  toggleMariSecondaryFlyout,
  useFlyoutPresence,
  useFlyoutStackPresence,
  type MariSecondaryFlyoutId,
} from "@/components/maringo/maringo-flyout-chrome";
import {
  timelineSideLabel,
  isMariMailStubText,
  type MariTimelineSide,
} from "@/lib/mari/timeline-side";
import {
  detectReplyLanguage,
  type ReplyLang,
} from "@/lib/microsoft/reply-language-shared";
import type { MariTimeLine } from "@/lib/mari/timekeeping-shared";
import { formatMariProjectLabel } from "@/lib/mari/timekeeping-shared";
import { MaringoTimekeepingPanel } from "@/components/maringo/maringo-timekeeping-panel";
import { MaringoTimeBookDialog } from "@/components/maringo/maringo-time-book-dialog";
import { MaringoTicketKopfForm } from "@/components/maringo/maringo-ticket-kopf-form";
import type { TimeBookFormDefaults } from "@/components/maringo/maringo-time-book-form";
import { AdhocEventDialog } from "@/components/calendar/adhoc-event-dialog";
import { MeetingTranscriptPanel } from "@/components/microsoft/meeting-transcript-panel";
import type { MariCalendarStamp } from "@/lib/mari/calendar-stamp";
import {
  MaringoTimeSuggestionsPanel,
  suggestionToBookDefaults,
  type MariTimeSuggestion,
} from "@/components/maringo/maringo-time-suggestions-panel";
import { TicketAnalyzeAttachmentPicker } from "@/components/maringo/ticket-analyze-attachment-picker";
import { TicketColleaguePingDialog } from "@/components/maringo/ticket-colleague-ping-dialog";
import { TtvDutyChip } from "@/components/maringo/ttv-duty-chip";
import { TtvDutyPanel } from "@/components/maringo/ttv-duty-panel";
import { CustomerWorkspacePanel } from "@/components/maringo/customer-workspace-panel";

function ReplyLangToggle({
  lang,
  busy,
  onChange,
}: {
  lang: ReplyLang;
  busy: boolean;
  onChange: (lang: ReplyLang) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border/60 p-0.5"
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {(["de", "en"] as const).map((code) => (
        <Button
          key={code}
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          className={cn(
            "rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase",
            lang === code
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(code);
          }}
        >
          {code}
        </Button>
      ))}
    </div>
  );
}

function sideChipClass(side: MariTimelineSide): string {
  switch (side) {
    case "support":
      return "border-sky-200 bg-sky-100/80 text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/20 dark:text-sky-100";
    case "customer":
      return "border-teal-200 bg-teal-100/80 text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/20 dark:text-teal-100";
    case "system":
      // Slate/navy — nicht Sky (Support) und nicht Teal (Kunde)
      return "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-400/30 dark:bg-slate-500/20 dark:text-slate-100";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function attachmentUrl(attachmentId: number, download = false): string {
  const q = download ? "?download=1" : "";
  return `/api/maringo/attachments/${attachmentId}${q}`;
}

function TimelineImageThumb({
  attachment,
  onOpen,
}: {
  attachment: MariTimelineAttachment;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(attachmentUrl(attachment.attachmentId), {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.size < 32) throw new Error("empty");
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.attachmentId]);

  if (failed) {
    return (
      <a
        href={attachmentUrl(attachment.attachmentId, true)}
        className="inline-flex h-24 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 bg-muted/30 px-2 text-center text-[0.625rem] text-muted-foreground hover:border-orange-300 hover:text-foreground"
        title={`${attachment.orgFilename} herunterladen`}
      >
        <Paperclip className="size-3.5" />
        <span className="line-clamp-2 w-full break-all">
          {attachment.orgFilename}
        </span>
      </a>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="group relative h-auto overflow-hidden rounded-lg border border-border/60 bg-background p-0 shadow-sm transition hover:border-orange-300"
      onClick={onOpen}
      title={attachment.orgFilename}
      disabled={!src}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.orgFilename}
          className="h-24 w-auto max-w-[11rem] object-cover"
        />
      ) : (
        <span className="flex h-24 w-28 items-center justify-center text-[0.625rem] text-muted-foreground">
          Lädt…
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[0.625rem] text-white opacity-0 transition group-hover:opacity-100">
        {attachment.orgFilename}
      </span>
    </Button>
  );
}

function TimelineAttachments({
  attachments,
}: {
  attachments: MariTimelineAttachment[];
}) {
  const [lightbox, setLightbox] = useState<MariTimelineAttachment | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const images = attachments.filter((a) => a.isImage);
  const files = attachments.filter((a) => !a.isImage);

  useEffect(() => {
    if (!lightbox) {
      setLightboxSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const res = await fetch(attachmentUrl(lightbox.attachmentId), {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setLightboxSrc(objectUrl);
      } catch {
        if (!cancelled) setLightboxSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lightbox]);

  return (
    <>
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {images.map((a) => (
            <TimelineImageThumb
              key={a.attachmentId}
              attachment={a}
              onOpen={() => setLightbox(a)}
            />
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 pt-0.5">
          {files.map((a) => (
            <li key={a.attachmentId}>
              <a
                href={attachmentUrl(a.attachmentId, true)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1 text-[0.6875rem] font-medium text-foreground hover:border-orange-300 hover:bg-orange-50/50 dark:hover:border-orange-400/40 dark:hover:bg-orange-500/10"
                title={a.orgFilename}
              >
                <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.orgFilename}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {lightbox ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.orgFilename}
          onClick={() => setLightbox(null)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 size-9 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => setLightbox(null)}
            aria-label="Schliessen"
          >
            <X className="size-5" />
          </Button>
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightboxSrc}
                alt={lightbox.orgFilename}
                className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
              />
            ) : (
              <p className="rounded-lg bg-white/90 px-4 py-3 text-sm text-foreground">
                Bild wird geladen…
              </p>
            )}
            <a
              href={attachmentUrl(lightbox.attachmentId, true)}
              className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-foreground hover:bg-white"
            >
              {lightbox.orgFilename} herunterladen
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatTimelineAt(iso: string): string {
  return formatSwissDateTime(iso);
}

function formatDateTimeShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const swiss = formatSwissDateTime(iso);
  return swiss === "–" ? null : swiss;
}

function formatDateShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const swiss = formatSwissDate(iso);
  return swiss === "–" ? null : swiss;
}

function formatStampWhen(stamp: {
  eventDate: string;
  startHm: string | null;
}): string {
  const day =
    formatDateShort(stamp.eventDate) ||
    stamp.eventDate;
  const hm = stamp.startHm?.slice(0, 5) || null;
  return hm ? `${day} ${hm}` : day;
}

function zurichTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function primaryContact(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.split(";")[0]?.trim() || null;
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function joinMeta(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map((p) => p?.trim()).filter(Boolean) as string[];
  return cleaned.length ? cleaned.join(" · ") : null;
}

function StatusChip({
  status,
  statusName,
  className,
}: {
  status: number;
  statusName?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 shrink-0 rounded-full px-2 text-[0.625rem] font-semibold",
        statusChipClass(status),
        className
      )}
    >
      {statusChipLabel(status, statusName)}
    </Badge>
  );
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="truncate text-xs font-semibold leading-snug">
        {children}
      </div>
    </div>
  );
}

function TimelineRow({
  item,
  onDeleteInternalNote,
  deletingAttachmentId,
}: {
  item: MariTimelineItem;
  onDeleteInternalNote?: (attachmentId: number) => void;
  deletingAttachmentId?: number | null;
}) {
  const side = item.side || "unknown";

  if (item.kind === "change") {
    return (
      <li className="relative pl-8">
        <span className="absolute left-[0.55rem] top-2 size-2.5 rounded-full bg-slate-600 ring-4 ring-background" />
        <div className="inline-flex max-w-full flex-col rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-slate-900 dark:border-slate-400/30 dark:bg-slate-500/15 dark:text-slate-100">
          <span className="text-[0.6875rem] font-medium leading-tight text-slate-600 dark:text-slate-300">
            {formatTimelineAt(item.at)}
          </span>
          <span className="text-xs font-medium leading-snug">
            {item.text}
          </span>
        </div>
      </li>
    );
  }

  const attachments = item.attachments || [];
  const hasAttachments = attachments.length > 0;
  const isAttachmentOnly =
    item.kind === "attachment" ||
    (hasAttachments && isMariMailStubText(item.text));
  const showBody =
    Boolean(item.text?.trim() || item.html?.trim()) &&
    !(isAttachmentOnly && isMariMailStubText(item.text));
  const fromSupport = side === "support";
  const deletableId = item.deletableAttachmentId ?? null;
  const deleting =
    deletableId != null && deletingAttachmentId === deletableId;
  const bubble =
    side === "support"
      ? "ml-auto border-sky-200/80 bg-sky-50 text-sky-950 dark:border-sky-400/25 dark:bg-sky-500/12 dark:text-sky-100"
      : side === "system"
        ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-400/25 dark:bg-slate-500/12 dark:text-slate-100"
        : side === "customer"
          ? "border-teal-200/70 bg-teal-50/50 text-teal-950 dark:border-teal-400/25 dark:bg-teal-500/10 dark:text-teal-50"
          : "border-border/70 bg-muted/40 text-foreground";
  const dot =
    side === "support"
      ? "bg-sky-500"
      : side === "customer"
        ? "bg-teal-600"
        : side === "system"
          ? "bg-slate-600"
          : "bg-muted-foreground";

  return (
    <li className="relative pl-8">
      <span
        className={cn(
          "absolute left-[0.45rem] top-3 size-3 rounded-full ring-4 ring-background",
          dot
        )}
      />
      <div
        className={cn("max-w-[92%] space-y-1", fromSupport && "ml-auto")}
      >
        <p className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[0.625rem] font-bold normal-case tracking-normal",
              sideChipClass(side)
            )}
          >
            {timelineSideLabel(side)}
          </span>
          <span>
            {formatTimelineAt(item.at)} · {item.label}
            {item.actor ? ` · ${item.actor}` : ""}
            {item.meta ? ` · ${item.meta}` : ""}
          </span>
          {deletableId != null && onDeleteInternalNote ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[0.625rem] text-muted-foreground hover:text-destructive"
              disabled={deleting}
              title="Internen Kommentar löschen"
              onClick={() => onDeleteInternalNote(deletableId)}
            >
              <Trash2 className="size-3" />
              {deleting ? "Lösche…" : "Löschen"}
            </Button>
          ) : null}
        </p>
        {item.subject ? (
          <p className="text-xs font-medium text-foreground/80">
            {item.subject}
          </p>
        ) : null}
        <div
          className={cn(
            "space-y-2 rounded-md border px-3.5 py-2.5 text-[0.8125rem] leading-relaxed",
            bubble
          )}
        >
          {showBody ? (
            item.html ? (
              <div
                className="mari-note-html max-w-none overflow-x-auto text-[0.8125rem] leading-relaxed [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_pre]:whitespace-pre-wrap [&_pre]:font-mono [&_pre]:text-[0.6875rem]"
                dangerouslySetInnerHTML={{ __html: item.html }}
              />
            ) : (
              <div className="whitespace-pre-wrap">{item.text}</div>
            )
          ) : null}
          {isAttachmentOnly && hasAttachments ? (
            <p className="text-[0.6875rem] text-muted-foreground">
              {attachments.length === 1
                ? "Anhang aus E-Mail / Ticket"
                : `${attachments.length} Anhänge aus E-Mail / Ticket`}
            </p>
          ) : null}
          {hasAttachments ? (
            <TimelineAttachments attachments={attachments} />
          ) : null}
          {!showBody && !hasAttachments ? (
            <span className="text-muted-foreground">(kein Text)</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function copyArtifactCode(code: string, title: string) {
  void navigator.clipboard.writeText(code).then(
    () =>
      showActionFeedback({
        headline: "Skript kopiert",
        detail: title,
        tone: "success",
      }),
    () =>
      showActionFeedback({
        headline: "Kopieren fehlgeschlagen",
        tone: "error",
      })
  );
}

function SolutionArtifactCard({
  artifact,
  dialectHint,
}: {
  artifact: MariSolutionArtifact;
  dialectHint?: string;
}) {
  const dialect = dialectHint || artifactKindLabel(artifact.kind);
  const unpairedSql =
    !dialectHint &&
    (artifact.kind === "sql_hana" || artifact.kind === "sql_sqlserver");
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug break-words">
            {artifact.title}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {dialect}
            {artifact.language ? ` · ${artifact.language}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => copyArtifactCode(artifact.code, artifact.title)}
        >
          <Copy className="size-3.5" />
          Kopieren
        </Button>
      </div>
      {artifact.note ? (
        <p className="px-3 pb-2 text-[0.6875rem] text-muted-foreground">
          {artifact.note}
        </p>
      ) : null}
      {unpairedSql ? (
        <p className="px-3 pb-2 text-[0.6875rem] text-amber-800 dark:text-amber-200">
          Gegenstück fehlt — HANA und SQL Server sollten beide da sein.
        </p>
      ) : null}
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border-t border-foreground/5 bg-muted/40 p-3 font-mono text-[0.6875rem] leading-snug">
        {artifact.code}
      </pre>
    </div>
  );
}

const MARI_TICKET_REVIEW_SS_KEY = "mari-ticket-review";

function readMariTicketReview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(MARI_TICKET_REVIEW_SS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMariTicketReview(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(MARI_TICKET_REVIEW_SS_KEY, on ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

function TicketReviewToggle({
  active,
  onToggle,
  compact = false,
}: {
  active: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={active}
      aria-label={active ? "Review aus" : "Ticket Review"}
      title={
        active
          ? "Review aus — Analyse und Stundenbuchung wieder anzeigen"
          : "Ticket Review — KI-Analyse und Stundenbuchung ausblenden"
      }
      onClick={onToggle}
      className={cn(
        "h-auto rounded-full font-semibold",
        compact
          ? "px-2 py-0.5 text-[0.625rem]"
          : "px-2.5 py-1 text-[0.6875rem]",
        active
          ? "border-transparent bg-orange-500/90 text-white shadow-sm hover:bg-orange-600 hover:text-white dark:bg-orange-500/85 dark:text-orange-50 dark:hover:bg-orange-500"
          : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
      )}
    >
      <EyeOff className="size-3.5" strokeWidth={APP_ICON_STROKE} />
      {active ? "Review läuft" : "Ticket Review"}
    </Button>
  );
}

export function MaringoWorkspaceClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [workspaceTab, setWorkspaceTab] = useState<
    "tickets" | "hours" | "kunde" | "ttv"
  >("tickets");
  const [akteCard, setAkteCard] = useState<MariCustomerOption | null>(null);
  /** URL / ticket / search pick stays even if that customer is outside the filter set. */
  const akteExplicitRef = useRef(false);
  const [statuses, setStatuses] = useState<number[]>([...WORK_STATUS_IDS]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filterReady, setFilterReady] = useState(false);
  /** Skip auto-PUT right after hydrate so defaults never overwrite saved prefs. */
  const skipFilterPrefsSaveRef = useRef(true);
  const [timelineSort, setTimelineSort] =
    useState<MariTimelineSort>("oldest");
  const [listSort, setListSort] = useState<MariListSort>("newest");
  const [ttvLookbackDays, setTtvLookbackDays] = useState(
    DEFAULT_TTV_LOOKBACK_DAYS
  );
  const [listMetaFields, setListMetaFields] = useState<MariListMetaField[]>([
    ...DEFAULT_MARI_LIST_META_FIELDS,
  ]);
  const [tickets, setTickets] = useState<MariTicketListItem[]>([]);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [lookupTicket, setLookupTicket] = useState<MariTicketListItem | null>(
    null
  );
  const [lookupMissId, setLookupMissId] = useState<number | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const ticketsRef = useRef<MariTicketListItem[]>([]);
  const pinnedIssueIdRef = useRef<number | null>(null);
  const lookupInflightRef = useRef<number | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<number>>(
    () => new Set()
  );
  const [bulkDueDraft, setBulkDueDraft] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ticketFlyoutOpen, setTicketFlyoutOpen] = useState(false);
  const [secondaryFlyouts, setSecondaryFlyouts] = useState<
    MariSecondaryFlyoutId[]
  >([]);
  const [flyoutPortalReady, setFlyoutPortalReady] = useState(false);
  const ticketFlyoutWanted = ticketFlyoutOpen && selectedId != null;
  const ticketFlyoutPresence = useFlyoutPresence(ticketFlyoutWanted);
  const secondaryPresence = useFlyoutStackPresence(secondaryFlyouts);
  const [detail, setDetail] = useState<MariTicketDetail | null>(null);
  const [analysis, setAnalysis] = useState<MariTicketAnalysis | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [savedAnalyzedAt, setSavedAnalyzedAt] = useState<string | null>(null);
  const [analysisInternalNotePostedAt, setAnalysisInternalNotePostedAt] =
    useState<string | null>(null);
  const [imagesAnalyzed, setImagesAnalyzed] = useState(0);
  const [imageNames, setImageNames] = useState<string[]>([]);
  const [analysisUsage, setAnalysisUsage] = useState<AiTokenUsage | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [adoptingTodoKey, setAdoptingTodoKey] = useState<string | null>(null);
  const [adoptedTodoKeys, setAdoptedTodoKeys] = useState<Record<string, true>>(
    {}
  );
  const [analyzePickerOpen, setAnalyzePickerOpen] = useState(false);
  const [colleaguePingOpen, setColleaguePingOpen] = useState(false);
  const [postingInternalNote, setPostingInternalNote] = useState(false);
  const [translatingReplyDraft, setTranslatingReplyDraft] = useState(false);
  const [replyDraftLang, setReplyDraftLang] = useState<ReplyLang | null>(null);
  const [manualNoteDraft, setManualNoteDraft] = useState("");
  const [postingManualNote, setPostingManualNote] = useState(false);
  const [manualNoteHint, setManualNoteHint] = useState<string | null>(null);
  const [externalNoteDraft, setExternalNoteDraft] = useState("");
  const [postingExternalNote, setPostingExternalNote] = useState(false);
  const [draftingExternalNote, setDraftingExternalNote] = useState(false);
  const [externalNoteHint, setExternalNoteHint] = useState<string | null>(
    null
  );
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    number | null
  >(null);
  const [patching, setPatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [passwordUnreadable, setPasswordUnreadable] = useState(false);
  const [dueDraft, setDueDraft] = useState("");
  const [employees, setEmployees] = useState<MariEmployeeOption[]>([]);
  const [supportGroups, setSupportGroups] = useState<MariSupportGroupOption[]>(
    []
  );
  const [filterSupportGroupId, setFilterSupportGroupId] = useState("");
  const [defaultHandledBy, setDefaultHandledBy] = useState("");
  const [handledByList, setHandledByList] = useState<string[]>([]);
  const [extraHandledBy, setExtraHandledBy] = useState("");
  const [savedViews, setSavedViews] = useState<MariTicketSavedViewChip[]>([]);
  const [filterMode, setFilterMode] =
    useState<MariTicketFilterMode>("handler");
  const [selectedCustomers, setSelectedCustomers] = useState<
    MariCustomerOption[]
  >([]);
  const [customerDraft, setCustomerDraft] = useState<MariCustomerOption[]>(
    []
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<MariCustomerOption[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [editBookLineId, setEditBookLineId] = useState<number | null>(null);
  const [editBookDefaults, setEditBookDefaults] =
    useState<TimeBookFormDefaults | null>(null);
  const [ticketCalendarOpen, setTicketCalendarOpen] = useState(false);
  const [ticketCalendarStamp, setTicketCalendarStamp] =
    useState<MariCalendarStamp | null>(null);
  const [removingTicketAppointment, setRemovingTicketAppointment] =
    useState(false);
  const [listCalendarStamps, setListCalendarStamps] = useState<
    Record<number, MariCalendarStamp>
  >({});
  const [pendingStampBook, setPendingStampBook] =
    useState<MariTimeSuggestion | null>(null);
  const [suggestionsRefresh, setSuggestionsRefresh] = useState(0);
  const [busyTicketLineId, setBusyTicketLineId] = useState<number | null>(null);
  const [ticketTimeLines, setTicketTimeLines] = useState<MariTimeLine[]>([]);
  const [ticketTimeLoading, setTicketTimeLoading] = useState(false);
  const [ticketReview, setTicketReview] = useState(false);

  const statusParam = useMemo(() => statuses.join(","), [statuses]);
  const analysisUsageLines = useMemo(
    () => formatTokenUsageBreakdownLines(analysisUsage),
    [analysisUsage]
  );
  const nextReplyDraftLang = useMemo((): ReplyLang => {
    if (replyDraftLang) return replyDraftLang;
    const draft = analysis?.nextReplyDraft?.trim() || "";
    return detectReplyLanguage(draft);
  }, [analysis?.nextReplyDraft, replyDraftLang]);
  const recommendedStatusId = useMemo(
    () => resolveRecommendedStatusId(analysis?.recommendedStatus),
    [analysis?.recommendedStatus]
  );

  const sortedTimeline = useMemo(() => {
    if (!detail?.timeline?.length) return [];
    const items = [...detail.timeline];
    items.sort((a, b) => {
      const ta = Date.parse(a.at) || 0;
      const tb = Date.parse(b.at) || 0;
      if (ta !== tb) {
        return timelineSort === "newest" ? tb - ta : ta - tb;
      }
      return timelineSort === "newest"
        ? b.id.localeCompare(a.id)
        : a.id.localeCompare(b.id);
    });
    return items;
  }, [detail?.timeline, timelineSort]);

  const searchedIssueId = useMemo(
    () => parseTicketNumberQuery(listSearchQuery),
    [listSearchQuery]
  );
  const numberLookupPending = useMemo(() => {
    if (
      searchedIssueId == null ||
      !shouldLookupTicketNumber(listSearchQuery)
    ) {
      return false;
    }
    if (lookupMissId === searchedIssueId) return false;
    if (tickets.some((t) => t.issueId === searchedIssueId)) return false;
    if (lookupTicket?.issueId === searchedIssueId) return false;
    return true;
  }, [
    searchedIssueId,
    listSearchQuery,
    lookupMissId,
    tickets,
    lookupTicket,
  ]);
  const displayedTickets = useMemo(() => {
    if (searchedIssueId != null && shouldLookupTicketNumber(listSearchQuery)) {
      if (lookupMissId === searchedIssueId) return [];
      const fromList = tickets.find((t) => t.issueId === searchedIssueId);
      const hit =
        fromList ||
        (lookupTicket?.issueId === searchedIssueId ? lookupTicket : null);
      return hit ? [hit] : [];
    }
    return filterTicketsByTextQuery(tickets, listSearchQuery);
  }, [
    tickets,
    listSearchQuery,
    searchedIssueId,
    lookupMissId,
    lookupTicket,
  ]);

  const sortedTickets = useMemo(() => {
    if (displayedTickets.length === 0) return displayedTickets;
    const items = [...displayedTickets];
    const stamp = (t: MariTicketListItem) =>
      Date.parse(t.requestDate || "") ||
      Date.parse(t.changeAtDate || "") ||
      0;
    items.sort((a, b) => {
      const ta = stamp(a);
      const tb = stamp(b);
      if (ta !== tb) {
        return listSort === "newest" ? tb - ta : ta - tb;
      }
      return listSort === "newest"
        ? b.issueId - a.issueId
        : a.issueId - b.issueId;
    });
    return items;
  }, [displayedTickets, listSort]);

  const visibleIssueIds = useMemo(
    () => sortedTickets.map((t) => t.issueId),
    [sortedTickets]
  );
  const allVisibleSelected =
    visibleIssueIds.length > 0 &&
    visibleIssueIds.every((id) => selectedIssueIds.has(id));
  const someVisibleSelected = visibleIssueIds.some((id) =>
    selectedIssueIds.has(id)
  );

  useEffect(() => {
    setSelectedIssueIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleIssueIds);
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleIssueIds]);

  const akteFilterCustomers = useMemo(() => {
    const seen = new Map<
      string,
      { cardCode: string; name: string; ticketCount: number }
    >();
    for (const t of tickets) {
      const code = (t.cardCode || "").trim();
      if (!code) continue;
      const existing = seen.get(code);
      if (existing) {
        existing.ticketCount += 1;
        if (t.addressMatchcode && existing.name === existing.cardCode) {
          existing.name = t.addressMatchcode.trim();
        }
      } else {
        seen.set(code, {
          cardCode: code,
          name: (t.addressMatchcode || code).trim() || code,
          ticketCount: 1,
        });
      }
    }
    return [...seen.values()];
  }, [tickets]);

  const ticketTimeHoursTotal = useMemo(() => {
    return (
      Math.round(
        ticketTimeLines.reduce((s, l) => s + l.hours, 0) * 100
      ) / 100
    );
  }, [ticketTimeLines]);

  const listHandledBy = useMemo(
    () =>
      (handledByList.length > 0
        ? handledByList
        : defaultHandledBy
          ? [defaultHandledBy]
          : []
      ).join(","),
    [handledByList, defaultHandledBy]
  );

  const loadEmployees = useCallback(async () => {
    try {
      const [empRes, grpRes] = await Promise.all([
        fetch("/api/maringo/employees"),
        fetch("/api/maringo/support-groups"),
      ]);
      const data = await empRes.json().catch(() => ({}));
      const grpData = await grpRes.json().catch(() => ({}));
      if (!empRes.ok) return;
      const list = Array.isArray(data.employees)
        ? (data.employees as MariEmployeeOption[])
        : [];
      setEmployees(list);
      const loadedGroups = grpRes.ok && Array.isArray(grpData.groups)
        ? (grpData.groups as MariSupportGroupOption[])
        : undefined;
      if (loadedGroups) {
        setSupportGroups(loadedGroups);
      }
      const def = String(data.defaultEmployeeNumber || "")
        .trim()
        .toUpperCase();
      if (def) {
        setDefaultHandledBy(def);
        setHandledByList((prev) => (prev.length > 0 ? prev : def ? [def] : []));
      }
      setFilterSupportGroupId((prev) => {
        if (prev) return prev;
        const emp = (def || "").trim().toUpperCase();
        const gid = firstSupportGroupIdForEmployee(list, emp, {
          groups: loadedGroups,
        });
        return gid != null ? String(gid) : "";
      });
    } catch {
      /* optional — manuelle Eingabe bleibt möglich */
    }
  }, []);

  const selectedCardCodesKey = useMemo(
    () =>
      selectedCustomers
        .map((c) => c.cardCode)
        .sort()
        .join(","),
    [selectedCustomers]
  );

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    const applyStamps = (raw: unknown) => {
      if (!raw || typeof raw !== "object") {
        setListCalendarStamps({});
        return;
      }
      const next: Record<number, MariCalendarStamp> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const id = Number(k);
        if (Number.isInteger(id) && v && typeof v === "object") {
          next[id] = v as MariCalendarStamp;
        }
      }
      setListCalendarStamps(next);
    };
    try {
      if (filterMode === "ttv") {
        const q = new URLSearchParams({
          filterMode: "ttv",
          ttvDays: String(ttvLookbackDays),
        });
        const res = await fetch(`/api/maringo/tickets?${q}`);
        const data = await res.json().catch(() => ({}));
        if (res.status === 503) {
          setConfigured(false);
          setPasswordUnreadable(Boolean(data.mariPasswordUnreadable));
          setTickets([]);
          setListCalendarStamps({});
          return;
        }
        setConfigured(true);
        setPasswordUnreadable(false);
        if (!res.ok) throw new Error(data.error || "Liste fehlgeschlagen");
        setTickets(Array.isArray(data.tickets) ? data.tickets : []);
        applyStamps(data.calendarStamps);
        if (typeof data.defaultHandledBy === "string" && data.defaultHandledBy) {
          setDefaultHandledBy(String(data.defaultHandledBy).toUpperCase());
        }
        return;
      }

      if (filterMode === "customer") {
        if (!selectedCardCodesKey) {
          setConfigured(true);
          setTickets([]);
          setListCalendarStamps({});
          return;
        }
        const q = new URLSearchParams();
        if (statusParam) q.set("status", statusParam);
        if (overdueOnly) q.set("overdue", "1");
        q.set("cardCodes", selectedCardCodesKey);
        const res = await fetch(`/api/maringo/tickets?${q}`);
        const data = await res.json().catch(() => ({}));
        if (res.status === 503) {
          setConfigured(false);
          setPasswordUnreadable(Boolean(data.mariPasswordUnreadable));
          setTickets([]);
          setListCalendarStamps({});
          return;
        }
        setConfigured(true);
        setPasswordUnreadable(false);
        if (!res.ok) throw new Error(data.error || "Liste fehlgeschlagen");
        setTickets(Array.isArray(data.tickets) ? data.tickets : []);
        applyStamps(data.calendarStamps);
        if (typeof data.defaultHandledBy === "string" && data.defaultHandledBy) {
          setDefaultHandledBy(String(data.defaultHandledBy).toUpperCase());
        }
        return;
      }

      const q = new URLSearchParams();
      if (statusParam) q.set("status", statusParam);
      if (overdueOnly) q.set("overdue", "1");
      if (listHandledBy) q.set("handledBy", listHandledBy);
      const res = await fetch(`/api/maringo/tickets?${q}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setConfigured(false);
        setPasswordUnreadable(Boolean(data.mariPasswordUnreadable));
        setTickets([]);
        setListCalendarStamps({});
        return;
      }
      setConfigured(true);
      setPasswordUnreadable(false);
      if (!res.ok) throw new Error(data.error || "Liste fehlgeschlagen");
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      applyStamps(data.calendarStamps);
      if (typeof data.defaultHandledBy === "string" && data.defaultHandledBy) {
        setDefaultHandledBy(String(data.defaultHandledBy).toUpperCase());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTickets([]);
      setListCalendarStamps({});
    } finally {
      setListLoading(false);
    }
  }, [
    statusParam,
    overdueOnly,
    listHandledBy,
    filterMode,
    selectedCardCodesKey,
    ttvLookbackDays,
  ]);

  ticketsRef.current = tickets;

  const lookupTicketByNumber = useCallback(async (issueId: number) => {
    if (!Number.isInteger(issueId) || issueId <= 0) return;
    const existing = ticketsRef.current.find((t) => t.issueId === issueId);
    if (existing) {
      setLookupTicket(null);
      setLookupMissId(null);
      pinnedIssueIdRef.current = issueId;
      setSelectedId(issueId);
      setTicketFlyoutOpen(true);
      setAnalyzePickerOpen(false);
      setWorkspaceTab("tickets");
      return;
    }
    if (lookupInflightRef.current === issueId) return;
    lookupInflightRef.current = issueId;
    setLookupBusy(true);
    setLookupMissId(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets?issueIds=${encodeURIComponent(String(issueId))}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Ticket-Suche fehlgeschlagen"
        );
      }
      const list: unknown[] = Array.isArray(data.tickets) ? data.tickets : [];
      const hit = list.find(
        (row): row is MariTicketListItem =>
          Boolean(
            row &&
              typeof row === "object" &&
              Number((row as MariTicketListItem).issueId) === issueId
          )
      );
      if (!hit) {
        setLookupTicket(null);
        setLookupMissId(issueId);
        return;
      }
      setLookupTicket(hit);
      setLookupMissId(null);
      pinnedIssueIdRef.current = issueId;
      setTickets((prev) =>
        prev.some((t) => t.issueId === hit.issueId) ? prev : [hit, ...prev]
      );
      const stamps = data.calendarStamps;
      if (stamps && typeof stamps === "object") {
        const stamp = (stamps as Record<string, unknown>)[String(issueId)];
        if (stamp && typeof stamp === "object") {
          setListCalendarStamps((prev) => ({
            ...prev,
            [issueId]: stamp as MariCalendarStamp,
          }));
        }
      }
      setSelectedId(issueId);
      setTicketFlyoutOpen(true);
      setAnalyzePickerOpen(false);
      setWorkspaceTab("tickets");
    } catch (err) {
      setLookupTicket(null);
      setLookupMissId(issueId);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (lookupInflightRef.current === issueId) {
        lookupInflightRef.current = null;
      }
      setLookupBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setAnalysis(null);
    setAnalysisOpen(false);
    setSavedAnalyzedAt(null);
    setAnalysisInternalNotePostedAt(null);
    setImagesAnalyzed(0);
    setImageNames([]);
    setAnalysisUsage(null);
    setReplyDraftLang(null);
    setTranslatingReplyDraft(false);
    setManualNoteDraft("");
    setManualNoteHint(null);
    setPostingManualNote(false);
    setExternalNoteDraft("");
    setExternalNoteHint(null);
    setPostingExternalNote(false);
    setDraftingExternalNote(false);
    setTicketCalendarStamp(null);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Detail fehlgeschlagen");
      const ticket = data.ticket as MariTicketDetail;
      setDetail(ticket);
      setTicketCalendarStamp(
        data.calendarStamp && typeof data.calendarStamp === "object"
          ? (data.calendarStamp as MariCalendarStamp)
          : null
      );
      const due = ticket?.dueDate;
      if (due) {
        setDueDraft(due.slice(0, 10));
      } else {
        const today = zurichTodayYmd();
        setDueDraft(today);
        try {
          const patchRes = await fetch(`/api/maringo/tickets/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dueDate: today }),
          });
          const patchData = await patchRes.json().catch(() => ({}));
          if (patchRes.ok && patchData.ticket) {
            setDetail(patchData.ticket as MariTicketDetail);
            void loadList();
          }
        } catch {
          /* Stichtag-Vorbelegung optional */
        }
      }

      const storedRes = await fetch(`/api/maringo/tickets/${id}/analyze`);
      const storedData = await storedRes.json().catch(() => ({}));
      if (storedRes.ok && storedData.stored && storedData.analysis) {
        setAnalysis(storedData.analysis as MariTicketAnalysis);
        setAdoptedTodoKeys({});
        setSavedAnalyzedAt(
          typeof storedData.analyzedAt === "string"
            ? storedData.analyzedAt
            : null
        );
        setImagesAnalyzed(Number(storedData.imagesAnalyzed) || 0);
        setImageNames(
          Array.isArray(storedData.imageNames)
            ? storedData.imageNames.map((n: unknown) => String(n))
            : []
        );
        setAnalysisUsage(
          storedData.usage && typeof storedData.usage === "object"
            ? (storedData.usage as AiTokenUsage)
            : null
        );
        setAnalysisInternalNotePostedAt(
          typeof storedData.internalNotePostedAt === "string"
            ? storedData.internalNotePostedAt
            : null
        );
        setAnalysisOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDetail(null);
      setTicketCalendarStamp(null);
    } finally {
      setDetailLoading(false);
    }
  }, [loadList]);

  const loadTicketTimeLines = useCallback(async (id: number) => {
    setTicketTimeLoading(true);
    try {
      const res = await fetch(
        `/api/maringo/timekeeping/by-ticket?issueId=${id}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ticket-Buchungen laden fehlgeschlagen");
      setTicketTimeLines((data.lines || []) as MariTimeLine[]);
    } catch {
      setTicketTimeLines([]);
    } finally {
      setTicketTimeLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyPrefsPatch = (patch: MariTicketFilterPrefsPatch) => {
      if (patch.statuses && patch.statuses.length > 0) {
        setStatuses([...patch.statuses].sort((a, b) => a - b));
      }
      if (typeof patch.overdueOnly === "boolean") {
        setOverdueOnly(patch.overdueOnly);
      }
      if (
        isMariTicketFilterMode(patch.filterMode) &&
        searchParams.get("filter") !== "ttv" &&
        !searchParams.get("handledBy")
      ) {
        setFilterMode(patch.filterMode);
      }
      const lookback = sanitizeTtvLookbackDays(patch.ttvLookbackDays);
      if (lookback != null) {
        setTtvLookbackDays(lookback);
      }
      if (patch.timelineSort === "newest" || patch.timelineSort === "oldest") {
        setTimelineSort(patch.timelineSort);
      }
      if (patch.listSort === "newest" || patch.listSort === "oldest") {
        setListSort(patch.listSort);
      }
      if (patch.listMetaFields && patch.listMetaFields.length > 0) {
        setListMetaFields(patch.listMetaFields);
      } else if (patch.listMetaFields) {
        setListMetaFields([...DEFAULT_MARI_LIST_META_FIELDS]);
      }
      if (patch.customers) {
        const next = patch.customers.map((c) => ({
          cardCode: c.cardCode,
          name: c.name || c.cardCode,
        }));
        setSelectedCustomers(next);
        setCustomerDraft(next);
      }
    };

    // Restore immediately from browser so Docker/API lag doesn't flash defaults.
    const local = readMariTicketFilterPrefsLocal();
    if (local) applyPrefsPatch(local);

    void (async () => {
      try {
        const res = await fetch("/api/maringo/ticket-filter-prefs");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          // Keep local/defaults — do not PUT defaults over a healthy DB.
          return;
        }
        const patch = parseMariTicketFilterPrefsPatch(data);
        if (patch) {
          applyPrefsPatch(patch);
          writeMariTicketFilterPrefsLocal(patch);
        }
      } catch {
        /* local/defaults bleiben */
      } finally {
        if (!cancelled) {
          skipFilterPrefsSaveRef.current = true;
          setFilterReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!filterReady) return;
    if (skipFilterPrefsSaveRef.current) {
      skipFilterPrefsSaveRef.current = false;
      return;
    }
    const payload = {
      statuses,
      overdueOnly,
      filterMode,
      customers: selectedCustomers,
      timelineSort,
      listSort,
      listMetaFields,
      ttvLookbackDays,
    };
    writeMariTicketFilterPrefsLocal(payload);
    const t = window.setTimeout(() => {
      void fetch("/api/maringo/ticket-filter-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        /* local mirror already written */
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [
    statuses,
    overdueOnly,
    filterMode,
    selectedCustomers,
    timelineSort,
    listSort,
    listMetaFields,
    ttvLookbackDays,
    filterReady,
  ]);

  useEffect(() => {
    if (filterMode === "customer") {
      setCustomerDraft(selectedCustomers);
    } else {
      setCustomerHits([]);
      setCustomerPickerOpen(false);
    }
    // Only when switching mode — not when applied selection changes mid-pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode]);

  useEffect(() => {
    if (filterMode !== "customer") return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setCustomerSearchBusy(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/maringo/customers?q=${encodeURIComponent(q)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          const hits = Array.isArray(data.customers)
            ? (data.customers as MariCustomerOption[])
            : [];
          setCustomerHits(hits);
          if (hits.length > 0) setCustomerPickerOpen(true);
        } catch {
          if (!cancelled) setCustomerHits([]);
        } finally {
          if (!cancelled) setCustomerSearchBusy(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [customerQuery, filterMode]);

  useEffect(() => {
    if (!filterReady) return;
    void loadList();
  }, [loadList, filterReady]);

  /** After idle / tab switch: auto-retry when MARI error is sticky. */
  useEffect(() => {
    if (!filterReady || workspaceTab !== "tickets") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!error) return;
      if (!/MARI HTTP|Login fehlgeschlagen|fehlgeschlagen/i.test(error)) {
        return;
      }
      void loadList();
      if (selectedId != null && ticketFlyoutOpen) {
        void loadDetail(selectedId);
        void loadTicketTimeLines(selectedId);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [
    error,
    filterReady,
    workspaceTab,
    loadList,
    loadDetail,
    loadTicketTimeLines,
    selectedId,
    ticketFlyoutOpen,
  ]);

  useEffect(() => {
    if (selectedId != null) {
      void loadDetail(selectedId);
      void loadTicketTimeLines(selectedId);
    } else {
      setDetail(null);
      setTicketTimeLines([]);
    }
  }, [selectedId, loadDetail, loadTicketTimeLines]);

  useEffect(() => {
    if (lookupBusy || numberLookupPending) return;
    const searching = listSearchQuery.trim().length > 0;
    const pool = searching ? displayedTickets : tickets;
    if (pool.length === 0) {
      if (searching) {
        setSelectedId(null);
        setTicketFlyoutOpen(false);
        setSecondaryFlyouts([]);
      } else if (!listLoading && pinnedIssueIdRef.current == null) {
        setSelectedId(null);
        setTicketFlyoutOpen(false);
        setSecondaryFlyouts([]);
      }
      return;
    }
    if (selectedId != null && pool.some((t) => t.issueId === selectedId)) {
      if (pinnedIssueIdRef.current === selectedId) {
        pinnedIssueIdRef.current = null;
      }
      return;
    }
    if (selectedId != null && selectedId === pinnedIssueIdRef.current) {
      return;
    }
    setSelectedId(pool[0].issueId);
  }, [
    tickets,
    displayedTickets,
    listSearchQuery,
    selectedId,
    lookupBusy,
    numberLookupPending,
    listLoading,
  ]);

  useEffect(() => {
    if (!shouldLookupTicketNumber(listSearchQuery)) return;
    const issueId = parseTicketNumberQuery(listSearchQuery);
    if (issueId == null) return;
    const t = window.setTimeout(() => {
      void lookupTicketByNumber(issueId);
    }, 350);
    return () => window.clearTimeout(t);
  }, [listSearchQuery, lookupTicketByNumber]);

  useEffect(() => {
    setFlyoutPortalReady(true);
  }, []);

  useEffect(() => {
    setTicketReview(readMariTicketReview());
  }, []);

  useEffect(() => {
    if (!ticketReview) return;
    setAnalyzePickerOpen(false);
    setAnalysisOpen(false);
    setBookDialogOpen(false);
    setSecondaryFlyouts((stack) =>
      stack.filter((id) => id !== "buchen" && id !== "buchungen")
    );
  }, [ticketReview]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "hours") setWorkspaceTab("hours");
    const view = searchParams.get("view");
    const card = (searchParams.get("card") || "").trim();
    if (view === "kunde") {
      setWorkspaceTab("kunde");
      if (card) {
        akteExplicitRef.current = true;
        setAkteCard((prev) =>
          prev?.cardCode === card ? prev : { cardCode: card, name: card }
        );
      }
    }
    if (view === "ttv") {
      setWorkspaceTab("ttv");
    }
    const filter = searchParams.get("filter");
    if (filter === "ttv") {
      setFilterMode("ttv");
      setListSort("newest");
      setWorkspaceTab("tickets");
    }
    const handledByRaw = searchParams.get("handledBy");
    const statusRaw = searchParams.get("status");
    if (handledByRaw || statusRaw) {
      setFilterMode("handler");
      setWorkspaceTab("tickets");
      if (handledByRaw) {
        const nums = [
          ...new Set(
            handledByRaw
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter((s) => /^[A-Z0-9]{2,20}$/.test(s))
          ),
        ];
        if (nums.length > 0) setHandledByList(nums);
      }
      if (statusRaw) {
        const ids = parseStatusIdsParam(statusRaw, []);
        if (ids.length > 0) setStatuses(ids);
      }
      if (searchParams.get("overdue") === "1") setOverdueOnly(true);
    }
    const openRaw = searchParams.get("open");
    if (openRaw) {
      const id = Number(openRaw);
      if (Number.isFinite(id) && id > 0) {
        pinnedIssueIdRef.current = id;
        setSelectedId(id);
        setTicketFlyoutOpen(true);
        setWorkspaceTab("tickets");
        if (searchParams.get("book") === "1" && !readMariTicketReview()) {
          setBookDialogOpen(true);
        }
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const openRaw = searchParams.get("open");
    if (!openRaw || listLoading) return;
    const id = Number(openRaw);
    if (!Number.isInteger(id) || id <= 0) return;
    if (ticketsRef.current.some((t) => t.issueId === id)) return;
    void lookupTicketByNumber(id);
  }, [searchParams, listLoading, lookupTicketByNumber]);

  useEffect(() => {
    setAkteCard((prev) => {
      if (prev) {
        const match = akteFilterCustomers.find(
          (c) => c.cardCode === prev.cardCode
        );
        if (match) {
          return prev.name === match.name
            ? prev
            : { cardCode: match.cardCode, name: match.name };
        }
        if (akteExplicitRef.current) return prev;
      }
      const first = akteFilterCustomers[0];
      return first ? { cardCode: first.cardCode, name: first.name } : null;
    });
  }, [akteFilterCustomers]);

  useEffect(() => {
    setSecondaryFlyouts([]);
  }, [selectedId]);

  useEffect(() => {
    if (!ticketFlyoutOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [ticketFlyoutOpen]);

  useEffect(() => {
    if (!ticketFlyoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bookDialogOpen) return;
      // Nested MARI dialogs (z.B. Arbeitszeit bearbeiten) zuerst
      if (document.querySelector('[data-slot="dialog-overlay"]')) return;
      e.preventDefault();
      e.stopPropagation();
      if (secondaryFlyouts.length > 0) {
        setSecondaryFlyouts((s) => s.slice(0, -1));
        return;
      }
      setTicketFlyoutOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ticketFlyoutOpen, secondaryFlyouts, bookDialogOpen]);

  function openTicket(issueId: number) {
    setSelectedId(issueId);
    setTicketFlyoutOpen(true);
    setAnalyzePickerOpen(false);
    setWorkspaceTab("tickets");
  }

  function openAkte(ticket: {
    cardCode: string | null;
    addressMatchcode: string | null;
  }) {
    if (!ticket.cardCode) return;
    akteExplicitRef.current = true;
    setAkteCard({
      cardCode: ticket.cardCode,
      name: ticket.addressMatchcode || ticket.cardCode,
    });
    setTicketFlyoutOpen(false);
    setSecondaryFlyouts([]);
    setWorkspaceTab("kunde");
  }

  function closeTicketFlyout() {
    setSecondaryFlyouts([]);
    setTicketFlyoutOpen(false);
    setAnalyzePickerOpen(false);
  }

  function toggleTicketReview() {
    const next = !ticketReview;
    writeMariTicketReview(next);
    setTicketReview(next);
  }

  function toggleSecondary(id: MariSecondaryFlyoutId) {
    if (ticketReview && (id === "buchen" || id === "buchungen")) return;
    setSecondaryFlyouts((stack) => toggleMariSecondaryFlyout(stack, id));
  }

  function closeSecondary(id: MariSecondaryFlyoutId) {
    setSecondaryFlyouts((stack) => stack.filter((x) => x !== id));
  }

  async function bookFromSuggestion(s: MariTimeSuggestion) {
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${s.issueId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Ticket für Buchung laden fehlgeschlagen");
      }
      const ticket = data.ticket as MariTicketDetail | undefined;
      setPendingStampBook(s);
      setEditBookLineId(null);
      setEditBookDefaults(
        suggestionToBookDefaults(
          s,
          ticket
            ? {
                projectNumber: ticket.projectNumber,
                projectLabel: ticket.projectNumber
                              ? formatMariProjectLabel(
                                  ticket.projectNumber,
                                  ticket.addressMatchcode || ticket.cardCode
                                )
                              : "",
                contractId: ticket.contractId,
                contractPositionId: ticket.contractPositionId,
                activity: ticket.briefDescription,
              }
            : null
        )
      );
      setSelectedId(s.issueId);
      setBookDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleStatus(id: number) {
    setStatuses((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length === 0 ? prev : next;
      }
      return [...prev, id].sort((a, b) => a - b);
    });
  }

  function applyDefaultHandlerAndGroup() {
    setExtraHandledBy("");
    if (defaultHandledBy) {
      setHandledByList([defaultHandledBy]);
      const gid = firstSupportGroupIdForEmployee(
        employees,
        defaultHandledBy,
        { groups: supportGroups }
      );
      setFilterSupportGroupId(gid != null ? String(gid) : "");
      return;
    }
    setHandledByList([]);
    setFilterSupportGroupId("");
  }

  function selectAllWorkStatuses() {
    setStatuses([...WORK_STATUS_IDS]);
    setOverdueOnly(false);
    applyDefaultHandlerAndGroup();
  }

  function resetHandlerFilters() {
    applyDefaultHandlerAndGroup();
  }

  function selectAllStatuses() {
    setStatuses([...ALL_STATUS_IDS]);
    setOverdueOnly(false);
  }

  function onFilterSupportGroupChange(next: string) {
    setFilterSupportGroupId(next);
  }

  const loadSavedViews = useCallback(async () => {
    try {
      const res = await fetch("/api/maringo/ticket-views");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setSavedViews(
        Array.isArray(data.views) ? (data.views as MariTicketSavedViewChip[]) : []
      );
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    if (!filterReady) return;
    void loadSavedViews();
  }, [filterReady, loadSavedViews]);

  async function saveCurrentView(label: string, showOnHome: boolean) {
    const handledBy =
      handledByList.length > 0
        ? handledByList
        : defaultHandledBy
          ? [defaultHandledBy]
          : [];
    const res = await fetch("/api/maringo/ticket-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        handledBy,
        statuses,
        overdueOnly,
        showOnHome,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
    await loadSavedViews();
  }

  function applySavedView(view: MariTicketSavedViewChip) {
    setFilterMode("handler");
    setHandledByList(view.handledBy);
    setStatuses(view.statuses.length > 0 ? view.statuses : [...WORK_STATUS_IDS]);
    setOverdueOnly(view.overdueOnly);
    setWorkspaceTab("tickets");
    router.replace(view.href);
  }

  async function runAnalyze(options?: {
    includeImages?: boolean;
    attachmentIds?: number[];
    products?: string[];
  }) {
    if (!selectedId) return;
    const includeImages = Boolean(options?.includeImages);
    const attachmentIds = Array.isArray(options?.attachmentIds)
      ? options.attachmentIds
      : undefined;
    const products = Array.isArray(options?.products) ? options.products : [];
    setAnalyzing(true);
    setError(null);
    setAnalysisUsage(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeImages, attachmentIds, products }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setAnalysis(data.analysis as MariTicketAnalysis);
      setAdoptedTodoKeys({});
      setImagesAnalyzed(Number(data.imagesAnalyzed) || 0);
      setImageNames(
        Array.isArray(data.imageNames)
          ? data.imageNames.map((n: unknown) => String(n))
          : []
      );
      setAnalysisUsage(
        data.usage && typeof data.usage === "object"
          ? (data.usage as AiTokenUsage)
          : null
      );
      setReplyDraftLang(null);
      setSavedAnalyzedAt(
        typeof data.analyzedAt === "string"
          ? data.analyzedAt
          : new Date().toISOString()
      );
      setAnalysisInternalNotePostedAt(null);
      setAnalysisOpen(true);
      if (selectedId != null) {
        setTickets((prev) =>
          prev.map((t) =>
            t.issueId === selectedId ? { ...t, hasAnalysis: true } : t
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function adoptSupportTodo(task: {
    title: string;
    reason?: string;
    dueHint?: string | null;
  }) {
    if (!selectedId) return;
    const key = task.title;
    setAdoptingTodoKey(key);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/adopt-todo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: task.title,
            reason: task.reason,
            dueHint: task.dueHint ?? null,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "To Do anlegen fehlgeschlagen");
      }
      setAdoptedTodoKeys((prev) => ({ ...prev, [key]: true }));
      showActionFeedback({
        headline: "Als To Do übernommen",
        detail: typeof json.task?.title === "string" ? json.task.title : key,
        tone: "success",
      });
    } catch (err) {
      showActionFeedback({
        headline: "To Do fehlgeschlagen",
        detail: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setAdoptingTodoKey(null);
    }
  }

  function formatAnalyzedAt(iso: string): string {
    return formatSwissDateTime(iso);
  }

  async function changeNextReplyDraftLanguage(targetLang: ReplyLang) {
    const draft = analysis?.nextReplyDraft?.trim();
    if (!draft) return;
    if (nextReplyDraftLang === targetLang) return;
    setTranslatingReplyDraft(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/translate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Antwort",
          body: draft.slice(0, 4000),
          targetLang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || `Übersetzung fehlgeschlagen (${res.status})`
        );
      }
      const body = String(data.body || "").trim();
      if (!body) throw new Error("Übersetzung lieferte keinen Text.");
      setAnalysis((prev) =>
        prev ? { ...prev, nextReplyDraft: body.slice(0, 2000) } : prev
      );
      setReplyDraftLang(data.language === "en" ? "en" : "de");
      if (data.usage && typeof data.usage === "object") {
        setAnalysisUsage((prev) => {
          const u = data.usage as AiTokenUsage;
          if (!prev) return u;
          return {
            ...u,
            promptTokens: (prev.promptTokens || 0) + (u.promptTokens || 0),
            completionTokens:
              (prev.completionTokens || 0) + (u.completionTokens || 0),
            totalTokens: (prev.totalTokens || 0) + (u.totalTokens || 0),
            estimatedCostUsd:
              (prev.estimatedCostUsd || 0) + (u.estimatedCostUsd || 0),
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingReplyDraft(false);
    }
  }

  async function postAnalysisAsInternalNote() {
    if (!selectedId || !analysis) return;
    const ok = window.confirm(
      "AI-Vorschläge als internen Kommentar auf dem Ticket speichern?\n\nNur für internes Support-Personal sichtbar — nicht für den Kunden."
    );
    if (!ok) return;
    setPostingInternalNote(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/internal-note`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Interner Kommentar fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      const postedAt =
        typeof data.internalNotePostedAt === "string"
          ? data.internalNotePostedAt
          : new Date().toISOString();
      setAnalysisInternalNotePostedAt(postedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingInternalNote(false);
    }
  }

  async function postManualInternalNote() {
    if (!selectedId) return;
    const text = manualNoteDraft.trim();
    if (!text) {
      setError("Kommentar ist leer.");
      return;
    }
    const ok = window.confirm(
      "Internen Kommentar auf dem Ticket speichern?\n\nNur für internes Support-Personal sichtbar — nicht für den Kunden."
    );
    if (!ok) return;
    setPostingManualNote(true);
    setError(null);
    setManualNoteHint(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/internal-note`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Interner Kommentar fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      setManualNoteDraft("");
      setManualNoteHint(
        "Interner Kommentar gespeichert (nur intern sichtbar)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingManualNote(false);
    }
  }

  async function postManualExternalNote() {
    if (!selectedId) return;
    const text = externalNoteDraft.trim();
    if (!text) {
      setError("Kommentar ist leer.");
      return;
    }
    const ok = window.confirm(
      "Externen Kommentar nach Maringo schreiben?\n\nSichtbar für den Kunden — Maringo kann daraus eine Mail auslösen."
    );
    if (!ok) return;
    setPostingExternalNote(true);
    setError(null);
    setExternalNoteHint(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/external-note`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Externer Kommentar fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      setExternalNoteDraft("");
      setExternalNoteHint("Externer Kommentar an Maringo geschrieben.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingExternalNote(false);
    }
  }

  async function draftExternalNoteWithAi() {
    if (!selectedId) return;
    if (externalNoteDraft.trim()) {
      const ok = window.confirm(
        "AI-Entwurf ins Feld übernehmen?\n\nDer aktuelle Text im externen Kommentar wird ersetzt."
      );
      if (!ok) return;
    }
    setDraftingExternalNote(true);
    setError(null);
    setExternalNoteHint(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/external-note/draft`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "AI-Entwurf fehlgeschlagen");
      }
      const text = String(data.text || "").trim();
      if (!text) throw new Error("AI-Entwurf lieferte keinen Text.");
      setExternalNoteDraft(text);
      setExternalNoteHint(
        "AI-Entwurf eingefügt — bitte prüfen, dann «Extern speichern»."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftingExternalNote(false);
    }
  }

  async function deleteInternalNote(attachmentId: number) {
    if (!selectedId) return;
    const ok = window.confirm(
      "Internen Kommentar wirklich löschen?\n\nDer Eintrag wird in Maringo entfernt."
    );
    if (!ok) return;
    setDeletingAttachmentId(attachmentId);
    setError(null);
    try {
      const res = await fetch(
        `/api/maringo/tickets/${selectedId}/internal-note?attachmentId=${attachmentId}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Löschen fehlgeschlagen");
      }
      if (data.ticket) {
        setDetail(data.ticket as MariTicketDetail);
      } else {
        await loadDetail(selectedId);
      }
      if (data.clearedAnalysisMarker) {
        setAnalysisInternalNotePostedAt(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function reloadTicketCalendarStamp(issueId: number) {
    try {
      const res = await fetch(`/api/maringo/tickets/${issueId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setTicketCalendarStamp(
        data.calendarStamp && typeof data.calendarStamp === "object"
          ? (data.calendarStamp as MariCalendarStamp)
          : null
      );
    } catch {
      /* optional */
    }
  }

  async function removeTicketAppointment() {
    if (!detail || !ticketCalendarStamp) return;
    const when = formatStampWhen(ticketCalendarStamp);
    const ok = window.confirm(
      `Termin für Ticket #${detail.issueId} am ${when} wirklich entfernen?\n\nDer Termin wird in Microsoft 365 gelöscht und in WorkBuddy nicht mehr angezeigt.`
    );
    if (!ok) return;
    setRemovingTicketAppointment(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          eventId: ticketCalendarStamp.eventId,
          calendarId: ticketCalendarStamp.calendarId || undefined,
          mariIssueId: detail.issueId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Termin konnte nicht entfernt werden.");
      }
      await reloadTicketCalendarStamp(detail.issueId);
      void loadList();
      setSuggestionsRefresh((n) => n + 1);
      showActionFeedback({
        headline: "Termin entfernt",
        detail: `#${detail.issueId} · ${when}`,
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "Termin nicht entfernt",
        detail: message,
        tone: "error",
      });
    } finally {
      setRemovingTicketAppointment(false);
    }
  }

  async function patchTicket(body: {
    status?: number;
    dueDate?: string | null;
    priority?: number;
    projectNumber?: string | null;
    contractId?: number | null;
    contractPositionId?: number | null;
    activity?: string | null;
    stdFreigabe?: number | null;
  }): Promise<boolean> {
    if (!selectedId) return false;
    setPatching(true);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Änderung fehlgeschlagen");
      setDetail(data.ticket as MariTicketDetail);
      await loadList();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setPatching(false);
    }
  }

  async function applyRecommendedStatus(statusId: number) {
    const label = statusChipLabel(statusId);
    const ok = await patchTicket({ status: statusId });
    if (ok) {
      showActionFeedback({
        headline: "Status in Maringo gesetzt",
        detail: label,
        tone: "success",
      });
      return;
    }
    showActionFeedback({
      headline: "Status nicht gesetzt",
      detail: "Maringo hat den Status nicht übernommen.",
      tone: "error",
    });
  }

  function toggleTicketSelected(issueId: number, checked: boolean) {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(issueId);
      else next.delete(issueId);
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of visibleIssueIds) next.add(id);
      } else {
        for (const id of visibleIssueIds) next.delete(id);
      }
      return next;
    });
  }

  async function runBulkAction(
    action: "delete" | "status" | "dueDate",
    extra?: { status?: number; dueDate?: string | null }
  ) {
    const issueIds = [...selectedIssueIds];
    if (issueIds.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/maringo/tickets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueIds,
          action,
          status: extra?.status,
          dueDate: extra?.dueDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 || res.status === 503) {
        throw new Error(data.error || "Änderung fehlgeschlagen");
      }
      const succeeded = Array.isArray(data.succeeded)
        ? (data.succeeded as number[])
        : [];
      const failed = Array.isArray(data.failed)
        ? (data.failed as { issueId: number; error: string }[])
        : [];
      if (succeeded.length === 0 && failed.length === 0 && !res.ok) {
        throw new Error(data.error || "Änderung fehlgeschlagen");
      }

      if (
        action === "delete" &&
        selectedId != null &&
        succeeded.includes(selectedId)
      ) {
        closeTicketFlyout();
      }

      if (failed.length === 0) {
        setSelectedIssueIds(new Set());
        if (action === "dueDate") setBulkDueDraft("");
      } else {
        setSelectedIssueIds((prev) => {
          const next = new Set(prev);
          for (const id of succeeded) next.delete(id);
          return next;
        });
      }

      await loadList();
      if (selectedId != null && succeeded.includes(selectedId) && action !== "delete") {
        await loadDetail(selectedId);
      }

      const idLabel = formatTicketIdList(succeeded, 8);
      const failHint =
        failed.length > 0
          ? `Fehler bei ${formatTicketIdList(
              failed.map((f) => f.issueId),
              4
            )}: ${failed[0]?.error || "unbekannt"}`
          : null;

      if (action === "delete") {
        showActionFeedback({
          headline:
            failed.length === 0
              ? `${succeeded.length} Ticket${succeeded.length === 1 ? "" : "s"} gelöscht`
              : `${succeeded.length} von ${issueIds.length} Tickets gelöscht`,
          detail: failHint || idLabel,
          tone: failed.length === 0 ? "success" : "error",
        });
        return;
      }
      if (action === "status") {
        const label =
          extra?.status != null
            ? STATUS_LABELS[extra.status] || `Status ${extra.status}`
            : "Status";
        showActionFeedback({
          headline:
            failed.length === 0
              ? `Status auf ${succeeded.length} Ticket${succeeded.length === 1 ? "" : "s"} gesetzt`
              : `Status bei ${succeeded.length} von ${issueIds.length} gesetzt`,
          detail: failHint || label,
          tone: failed.length === 0 ? "success" : "error",
        });
        return;
      }
      showActionFeedback({
        headline:
          failed.length === 0
            ? `Stichtag auf ${succeeded.length} Ticket${succeeded.length === 1 ? "" : "s"} gesetzt`
            : `Stichtag bei ${succeeded.length} von ${issueIds.length} gesetzt`,
        detail:
          failHint ||
          (extra?.dueDate ? formatSwissDate(extra.dueDate) : idLabel),
        tone: failed.length === 0 ? "success" : "error",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "Sammelaktion fehlgeschlagen",
        detail: message,
        tone: "error",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  async function saveTicketKopf(values: {
    projectNumber: string;
    contractId: number | null;
    contractPositionId: number | null;
    activity: string;
    stdFreigabe: number | null;
    contactPerson: string | null;
    contactEmail: string | null;
    supportGroupId: number | null;
    handledBy: string | null;
    priority: number | null;
    medium: number | null;
  }) {
    if (!selectedId) throw new Error("Kein Ticket gewählt.");
    setPatching(true);
    setError(null);
    try {
      const res = await fetch(`/api/maringo/tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectNumber: values.projectNumber,
          contractId: values.contractId,
          contractPositionId: values.contractPositionId,
          activity: values.activity,
          stdFreigabe: values.stdFreigabe,
          contactPerson: values.contactPerson,
          supportGroupId: values.supportGroupId,
          handledBy: values.handledBy,
          priority: values.priority ?? undefined,
          medium: values.medium,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Änderung fehlgeschlagen");
      setDetail(data.ticket as MariTicketDetail);
      await loadList();
    } finally {
      setPatching(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4 pb-10">
      <PageHeader
        title="Maringo Support"
        description={
          ticketReview
            ? "Support-Tickets, Verlauf und Kundenakte."
            : "Support-Tickets, Verlauf, AI-Analyse und Stundenbuchung."
        }
        logo={<MaringoLogo className="size-8" />}
        tone={pageVisuals.maringo.tone}
      />

      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <nav className={segmentedTrackClass} aria-label="Maringo Bereiche">
          <Button
            type="button"
            variant="ghost"
            data-segment="true"
            onClick={() => {
              setTicketFlyoutOpen(false);
              setSecondaryFlyouts([]);
              setWorkspaceTab("tickets");
            }}
            className={segmentedTriggerClass(workspaceTab === "tickets")}
          >
            <Inbox className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
            Tickets
          </Button>
          <Button
            type="button"
            variant="ghost"
            data-segment="true"
            onClick={() => {
              setTicketFlyoutOpen(false);
              setSecondaryFlyouts([]);
              setWorkspaceTab("hours");
            }}
            className={segmentedTriggerClass(workspaceTab === "hours")}
          >
            <Clock3 className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
            Stunden
          </Button>
          <Button
            type="button"
            variant="ghost"
            data-segment="true"
            onClick={() => {
              setTicketFlyoutOpen(false);
              setSecondaryFlyouts([]);
              setWorkspaceTab("kunde");
            }}
            className={segmentedTriggerClass(workspaceTab === "kunde")}
          >
            <FolderOpen className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
            Akte
          </Button>
          <Button
            type="button"
            variant="ghost"
            data-segment="true"
            onClick={() => {
              setTicketFlyoutOpen(false);
              setSecondaryFlyouts([]);
              setWorkspaceTab("ttv");
            }}
            className={segmentedTriggerClass(workspaceTab === "ttv")}
          >
            <CalendarRange className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
            TTV
          </Button>
        </nav>
        <TtvDutyChip
          onOpenInbox={() => {
            setTicketFlyoutOpen(false);
            setSecondaryFlyouts([]);
            setWorkspaceTab("tickets");
            setFilterMode("ttv");
            setListSort("newest");
          }}
        />
      </div>

      {!configured ? (
        <Card className="border-amber-200/80 bg-amber-50/50 dark:border-amber-400/30 dark:bg-amber-500/10">
          <CardContent className="space-y-3 p-4 text-sm">
            <p>
              {passwordUnreadable
                ? "MARI-Zugang unvollständig. Unter "
                : "MARI nicht bereit. Unter "}
              <Link
                href="/account"
                className="font-semibold text-orange-900 underline underline-offset-2 dark:text-orange-200"
              >
                Konto
              </Link>
              {passwordUnreadable
                ? " die Personalnummer setzen; REST-Zugang kommt aus der .env."
                : " die Personalnummer setzen. URL und REST-Zugang kommen vom Server."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      {workspaceTab === "hours" ? (
        <div className="space-y-4">
          <MaringoTimeSuggestionsPanel
            refreshKey={suggestionsRefresh}
            onBookSuggestion={(s) => void bookFromSuggestion(s)}
          />
          <MaringoTimekeepingPanel />
        </div>
      ) : workspaceTab === "ttv" ? (
        <TtvDutyPanel />
      ) : workspaceTab === "kunde" ? (
        <CustomerWorkspacePanel
          cardCode={akteCard?.cardCode || null}
          filterCustomers={akteFilterCustomers}
          ticketsLoading={listLoading}
          refreshKey={suggestionsRefresh}
          onOpenTicket={(id) => openTicket(id)}
          onBook={(ticket) => {
            setSelectedId(ticket.issueId);
            setBookDialogOpen(true);
          }}
          onAdhoc={(ticket) => {
            if (ticket) setSelectedId(ticket.issueId);
            setTicketCalendarOpen(true);
          }}
          onPickCustomer={(c, source) => {
            akteExplicitRef.current = source === "search";
            setAkteCard(c);
          }}
        />
      ) : (
      <div className="min-h-[70vh] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
        {/* List pane */}
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-0.5">
              <MariTicketSelectCheckbox
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected && !allVisibleSelected}
                disabled={visibleIssueIds.length === 0 || bulkBusy}
                label="Alle sichtbaren Tickets auswählen"
                onCheckedChange={toggleSelectAllVisible}
              />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-black tracking-tight">Tickets</p>
                <p className="text-[0.6875rem] text-muted-foreground">
                  {selectedIssueIds.size > 0
                    ? `${selectedIssueIds.size} von ${sortedTickets.length} ausgewählt`
                    : lookupBusy && searchedIssueId != null
                      ? `Suche #${searchedIssueId}…`
                      : listSearchQuery.trim()
                        ? `${sortedTickets.length} Treffer`
                      : filterMode === "ttv"
                        ? `${tickets.length} neu (${ttvLookbackLabel(ttvLookbackDays)})`
                        : `${tickets.length} Ticket${tickets.length === 1 ? "" : "s"}`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <TicketReviewToggle
                active={ticketReview}
                onToggle={toggleTicketReview}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => void loadList()}
                disabled={listLoading}
                aria-label="Aktualisieren"
              >
                <RefreshCw
                  className={cn("size-4", listLoading && "animate-spin")}
                  strokeWidth={APP_ICON_STROKE}
                />
              </Button>
            </div>
          </div>

          {selectedIssueIds.size > 0 ? (
            <MariTicketBulkBar
              selectedIds={[...selectedIssueIds]}
              busy={bulkBusy}
              dueDraft={bulkDueDraft}
              onDueDraftChange={setBulkDueDraft}
              onApplyStatus={(statusId) =>
                void runBulkAction("status", { status: statusId })
              }
              onApplyDue={() =>
                void runBulkAction("dueDate", { dueDate: bulkDueDraft || null })
              }
              onDelete={() => void runBulkAction("delete")}
            />
          ) : null}

          <div className="space-y-1.5 border-b border-border/50 px-3 py-2">
            {filterMode === "handler" ? (
              <MariTicketSavedViewsBar
                views={savedViews}
                onReload={() => void loadSavedViews()}
                canSave={
                  handledByList.length > 0 || Boolean(defaultHandledBy)
                }
                onSave={saveCurrentView}
                onApply={applySavedView}
                disabled={!configured}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {filterMode !== "ttv" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllWorkStatuses}
                    className={cn(
                      "h-auto rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold",
                      statuses.length === WORK_STATUS_IDS.length && !overdueOnly
                        ? "border-orange-200/90 bg-orange-50/80 text-orange-900 dark:border-orange-400/35 dark:bg-orange-500/15 dark:text-orange-100"
                        : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    Meine
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOverdueOnly((v) => !v)}
                    className={cn(
                      "h-auto rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold",
                      overdueOnly
                        ? "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-100"
                        : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    Überfällig
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full px-2.5 text-[0.6875rem] font-semibold"
                        />
                      }
                    >
                      Status · {statuses.length}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Status (Mehrfachauswahl)</DropdownMenuLabel>
                        {ALL_STATUS_IDS.map((id) => (
                          <DropdownMenuCheckboxItem
                            key={id}
                            checked={statuses.includes(id)}
                            onCheckedChange={() => toggleStatus(id)}
                          >
                            {STATUS_LABELS[id] || `Status ${id}`}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={selectAllWorkStatuses}>
                        Alle Arbeitsstatus
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={selectAllStatuses}>
                        Alle Status
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
              <div className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-border/70 p-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setListSort("newest")}
                  title="Neueste zuerst"
                  className={cn(
                    "h-auto rounded-full px-2 py-1 text-[0.6875rem] font-semibold",
                    listSort === "newest"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowDownAZ className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  Neu→Alt
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setListSort("oldest")}
                  title="Älteste zuerst"
                  className={cn(
                    "h-auto rounded-full px-2 py-1 text-[0.6875rem] font-semibold",
                    listSort === "oldest"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowUpAZ className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  Alt→Neu
                </Button>
              </div>
            </div>
            {filterMode === "ttv" ? (
              <p className="truncate text-[0.6875rem] leading-snug text-muted-foreground">
                Status NEU · {ttvLookbackLabel(ttvLookbackDays)} · alle
                Bearbeiter
              </p>
            ) : statuses.length > 0 ? (
              <p
                className="truncate text-[0.6875rem] leading-snug text-muted-foreground"
                title={statuses
                  .map((id) => STATUS_LABELS[id] || `Status ${id}`)
                  .join(", ")}
              >
                {statuses
                  .map((id) => STATUS_LABELS[id] || `Status ${id}`)
                  .join(" · ")}
              </p>
            ) : null}
            <div className="space-y-1.5 pt-0.5">
              <div
                className={segmentedTrackClass}
                role="tablist"
                aria-label="Ticket-Filter"
              >
                <Button
                  type="button"
                  variant="ghost"
                  role="tab"
                  data-segment="true"
                  aria-selected={filterMode === "handler"}
                  onClick={() => setFilterMode("handler")}
                  className={segmentedTriggerClass(filterMode === "handler")}
                >
                  <User className="size-4 shrink-0" strokeWidth={APP_ICON_STROKE} />
                  Bearbeiter
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  role="tab"
                  data-segment="true"
                  aria-selected={filterMode === "customer"}
                  onClick={() => setFilterMode("customer")}
                  className={segmentedTriggerClass(filterMode === "customer")}
                >
                  <Building2
                    className="size-4 shrink-0"
                    strokeWidth={APP_ICON_STROKE}
                  />
                  Kunde
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  role="tab"
                  data-segment="true"
                  aria-selected={filterMode === "ttv"}
                  title="Ticket-Tagesverantwortlicher — neue, noch nicht klassifizierte Tickets"
                  onClick={() => {
                    setFilterMode("ttv");
                    setListSort("newest");
                  }}
                  className={segmentedTriggerClass(filterMode === "ttv")}
                >
                  <CalendarRange
                    className="size-4 shrink-0"
                    strokeWidth={APP_ICON_STROKE}
                  />
                  TTV
                </Button>
              </div>

              {filterMode === "ttv" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="mari-ttv-days" className="sr-only">
                    TTV-Zeitraum
                  </Label>
                  <select
                    id="mari-ttv-days"
                    className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    value={ttvLookbackDays}
                    onChange={(e) => {
                      const next = sanitizeTtvLookbackDays(e.target.value);
                      if (next != null) setTtvLookbackDays(next);
                    }}
                    disabled={!configured}
                  >
                    {Array.from(
                      { length: TTV_LOOKBACK_DAYS_MAX - TTV_LOOKBACK_DAYS_MIN + 1 },
                      (_, i) => TTV_LOOKBACK_DAYS_MIN + i
                    ).map((days) => (
                      <option key={days} value={days}>
                        {days === 1
                          ? "1 Tag (nur heute)"
                          : days === 4
                            ? "4 Tage (Mo nach Wochenende)"
                            : `${days} Tage`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[0.625rem] text-muted-foreground">
                    Status NEU, unabhängig vom Bearbeiter. Zeitraum wird
                    gespeichert. Neueste oben.
                  </p>
                </div>
              ) : filterMode === "handler" ? (
                <MariHandlerMultiPicker
                  groups={supportGroups}
                  employees={employees}
                  groupId={filterSupportGroupId}
                  selected={
                    handledByList.length > 0
                      ? handledByList
                      : defaultHandledBy
                        ? [defaultHandledBy]
                        : []
                  }
                  defaultHandledBy={defaultHandledBy}
                  onGroupChange={onFilterSupportGroupChange}
                  onSelectedChange={setHandledByList}
                  onReset={resetHandlerFilters}
                  disabled={!configured}
                  extraNumber={extraHandledBy}
                  onExtraNumberChange={setExtraHandledBy}
                  onTicketNumber={(issueId) => {
                    setListSearchQuery(String(issueId));
                    void lookupTicketByNumber(issueId);
                  }}
                />
              ) : (
                <div className="space-y-1.5">
                  {selectedCustomers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedCustomers.map((c) => (
                        <Button
                          key={c.cardCode}
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Abwählen"
                          onClick={() => {
                            setSelectedCustomers((prev) =>
                              prev.filter((x) => x.cardCode !== c.cardCode)
                            );
                            setCustomerDraft((prev) =>
                              prev.filter((x) => x.cardCode !== c.cardCode)
                            );
                          }}
                          className="inline-flex h-auto max-w-full items-center gap-1 rounded-full border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[0.625rem] font-semibold text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-100"
                        >
                          <span className="truncate">
                            {c.name}
                            <span className="ml-1 font-normal opacity-70">
                              {c.cardCode}
                            </span>
                          </span>
                          <X className="size-3 shrink-0 opacity-60" aria-hidden />
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative">
                    <Label htmlFor="mari-customer-search" className="sr-only">
                      Kunde suchen
                    </Label>
                    <Input
                      id="mari-customer-search"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      placeholder="z.B. Bübchen oder CardCode…"
                      className="h-8 text-xs"
                      spellCheck={false}
                      autoComplete="off"
                      disabled={!configured}
                    />
                    {customerSearchBusy ? (
                      <p className="mt-1 text-[0.625rem] text-muted-foreground">
                        Suche…
                      </p>
                    ) : null}
                    {customerPickerOpen && customerHits.length > 0 ? (
                      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border/70 bg-background shadow-md">
                        <ul className="max-h-48 overflow-y-auto py-1">
                          {customerHits.map((hit) => {
                            const checked = customerDraft.some(
                              (c) => c.cardCode === hit.cardCode
                            );
                            return (
                              <li key={hit.cardCode}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className={cn(
                                    "h-auto w-full items-start justify-start gap-2 px-2.5 py-1.5 text-left text-xs font-normal",
                                    checked && "bg-sky-50/80 dark:bg-sky-500/15"
                                  )}
                                  onClick={() => {
                                    setCustomerDraft((prev) =>
                                      checked
                                        ? prev.filter(
                                            (c) => c.cardCode !== hit.cardCode
                                          )
                                        : [...prev, hit]
                                    );
                                  }}
                                >
                                  <span
                                    className={cn(
                                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                                      checked
                                        ? "border-sky-600 bg-sky-600 text-white"
                                        : "border-border/80 bg-background"
                                    )}
                                    aria-hidden
                                  >
                                    {checked ? (
                                      <Check className="size-3" strokeWidth={3} />
                                    ) : null}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-semibold">
                                      {hit.name}
                                    </span>
                                    <span className="block truncate text-[0.625rem] text-muted-foreground">
                                      {hit.cardCode}
                                    </span>
                                  </span>
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/20 px-2 py-1.5">
                          <p className="text-[0.625rem] text-muted-foreground">
                            {customerDraft.length} gewählt
                          </p>
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[0.6875rem]"
                              onClick={() => {
                                setCustomerDraft(selectedCustomers);
                                setCustomerQuery("");
                                setCustomerHits([]);
                                setCustomerPickerOpen(false);
                              }}
                            >
                              Abbrechen
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 bg-sky-600 px-2.5 text-[0.6875rem] text-white hover:bg-sky-700"
                              onClick={() => {
                                setSelectedCustomers(customerDraft);
                                setCustomerQuery("");
                                setCustomerHits([]);
                                setCustomerPickerOpen(false);
                              }}
                            >
                              Übernehmen
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {customerQuery.trim().length >= 2 &&
                    !customerSearchBusy &&
                    customerHits.length === 0 ? (
                      <p className="mt-1 text-[0.625rem] text-muted-foreground">
                        Keine Treffer
                      </p>
                    ) : null}
                  </div>
                  {selectedCustomers.length === 0 ? (
                    <p className="text-[0.625rem] text-muted-foreground">
                      Mehrere Kunden anhaken, dann «Übernehmen» — Tickets aller
                      Bearbeiter.
                    </p>
                  ) : (
                    <p className="text-[0.625rem] text-muted-foreground">
                      {selectedCustomers.length} Kunde
                      {selectedCustomers.length === 1 ? "" : "n"} aktiv · Tickets
                      aller Kollegen
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-b border-border/50 px-3 py-2">
            <Label htmlFor="mari-ticket-list-search" className="sr-only">
              Ticket suchen
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={APP_ICON_STROKE}
                aria-hidden
              />
              <Input
                id="mari-ticket-list-search"
                type="text"
                value={listSearchQuery}
                onChange={(e) => {
                  setListSearchQuery(e.target.value);
                  setLookupMissId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const id = parseTicketNumberQuery(listSearchQuery);
                  if (id != null) void lookupTicketByNumber(id);
                }}
                placeholder="Ticket-Nr., Betreff oder Kunde…"
                className="h-10 min-h-10 pr-10 pl-9 text-sm"
                spellCheck={false}
                autoComplete="off"
                disabled={!configured}
              />
              {listSearchQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
                  aria-label="Suche leeren"
                  onClick={() => {
                    setListSearchQuery("");
                    setLookupTicket(null);
                    setLookupMissId(null);
                  }}
                >
                  <X className="size-4" strokeWidth={APP_ICON_STROKE} />
                </Button>
              ) : null}
            </div>
            {numberLookupPending ||
            (lookupBusy && searchedIssueId != null) ? (
              <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                Suche Ticket #{searchedIssueId} — unabhängig von Status und
                Bearbeiter…
              </p>
            ) : lookupMissId != null &&
              (searchedIssueId === lookupMissId ||
                listSearchQuery.trim() === "") ? (
              <p className="mt-1.5 text-[0.6875rem] text-rose-800 dark:text-rose-200">
                Ticket #{lookupMissId} nicht gefunden.
              </p>
            ) : searchedIssueId != null &&
              shouldLookupTicketNumber(listSearchQuery) &&
              sortedTickets.length === 1 ? (
              <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                Treffer nach Nummer — Status- und Bearbeiterfilter gelten nicht.
              </p>
            ) : null}
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {listLoading && tickets.length === 0 && !listSearchQuery.trim() ? (
              <li className="bg-card px-3 py-8 text-sm text-muted-foreground">
                Lade Tickets…
              </li>
            ) : null}
            {(lookupBusy || numberLookupPending) &&
            sortedTickets.length === 0 ? (
              <li className="bg-card px-3 py-8 text-center text-sm text-muted-foreground">
                Suche Ticket #{searchedIssueId}…
              </li>
            ) : null}
            {!listLoading &&
            !lookupBusy &&
            !numberLookupPending &&
            sortedTickets.length === 0 ? (
              <li className="bg-card px-3 py-8 text-center text-sm text-muted-foreground">
                {lookupMissId != null
                  ? `Ticket #${lookupMissId} nicht gefunden.`
                  : listSearchQuery.trim()
                    ? `Keine Treffer für „${listSearchQuery.trim()}“.`
                  : filterMode === "ttv"
                    ? `Keine neuen Tickets (${ttvLookbackLabel(ttvLookbackDays)}).`
                    : filterMode === "customer" && selectedCustomers.length === 0
                      ? "Kunde wählen, um Tickets zu laden."
                      : "Keine Tickets für die gewählten Filter."}
              </li>
            ) : null}
            {sortedTickets.map((t, index) => {
              const active = t.issueId === selectedId;
              const zebra = index % 2 === 1;
              const due = formatDateShort(t.dueDate);
              const overdue = isOverdue(t.dueDate);
              const metaItems = buildMariTicketListMetaItems(
                t,
                listMetaFields
              );
              const stamp = listCalendarStamps[t.issueId] || null;
              const selected = selectedIssueIds.has(t.issueId);
              const rowFill = active
                ? "bg-orange-50 dark:bg-orange-950"
                : zebra
                  ? "bg-muted"
                  : "bg-card";
              return (
                <li
                  key={t.issueId}
                  className={cn(
                    "flex items-stretch",
                    rowFill,
                    selected && !active && "bg-orange-50 dark:bg-orange-950/50"
                  )}
                >
                  <MariTicketSelectCheckbox
                    checked={selected}
                    disabled={bulkBusy}
                    label={`Ticket #${t.issueId} auswählen`}
                    onCheckedChange={(checked) =>
                      toggleTicketSelected(t.issueId, checked)
                    }
                  />
                  <span
                    aria-hidden
                    className="my-1 ml-1.5 flex w-10 shrink-0 items-center justify-center self-stretch rounded-md border-2 border-white bg-orange-500 text-[1.25rem] font-black tabular-nums leading-none text-white shadow-sm dark:bg-orange-600"
                  >
                    {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => openTicket(t.issueId)}
                    className={cn(
                      "relative h-auto min-w-0 flex-1 items-start justify-start gap-2 rounded-none border-l-2 px-2.5 py-1.5 text-left",
                      rowFill,
                      selected && !active && "bg-orange-50 dark:bg-orange-950/50",
                      active
                        ? "border-l-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950"
                        : "border-l-transparent hover:bg-muted dark:hover:bg-muted"
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                          #{t.issueId}
                        </span>
                        {!ticketReview && t.hasAnalysis ? (
                          <span
                            title="AI-Analyse vorhanden"
                            className="inline-flex shrink-0"
                          >
                            <Sparkles
                              className="size-3.5 text-orange-500"
                              strokeWidth={APP_ICON_STROKE}
                              aria-hidden
                            />
                            <span className="sr-only">AI-Analyse vorhanden</span>
                          </span>
                        ) : null}
                        <p className="min-w-0 truncate text-[0.8125rem] font-semibold leading-snug tracking-tight">
                          {t.briefDescription}
                        </p>
                      </div>
                      {metaItems.length > 0 ? (
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
                          {metaItems.map((item, idx) => (
                            <span
                              key={`${item.id}-${idx}`}
                              className="inline-flex min-w-0 items-center gap-1.5"
                            >
                              {idx > 0 ? (
                                <span className="text-border" aria-hidden>
                                  ·
                                </span>
                              ) : null}
                              {item.kind === "customer" ? (
                                <MariCustomerChip className="max-w-[14rem]">
                                  {item.value}
                                </MariCustomerChip>
                              ) : (
                                <span className="truncate">{item.value}</span>
                              )}
                            </span>
                          ))}
                          {t.handledByName || t.handledBy ? (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              {metaItems.length > 0 ? (
                                <span className="text-border" aria-hidden>
                                  ·
                                </span>
                              ) : null}
                              <span className="truncate">
                                {t.handledByName || t.handledBy}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      ) : t.handledByName || t.handledBy ? (
                        <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
                          {t.handledByName || t.handledBy}
                        </p>
                      ) : null}
                    </div>
                    {stamp ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/90 bg-emerald-50 px-2 py-0.5 text-[0.625rem] font-semibold tabular-nums text-emerald-950 shadow-sm dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100"
                        title={`Termin eingeplant · ${formatStampWhen(stamp)}`}
                      >
                        Termin ({formatStampWhen(stamp)})
                      </span>
                    ) : null}
                    <div className="relative z-[2] flex shrink-0 flex-col items-end gap-0.5">
                      <StatusChip
                        status={t.status}
                        statusName={t.statusName}
                        className="h-4 px-1.5 text-[0.5625rem]"
                      />
                      {due ? (
                        <span
                          className={cn(
                            "text-[0.6875rem] font-semibold tabular-nums",
                            overdue ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"
                          )}
                          title={
                            formatDateShort(t.dueDate)
                              ? `Stichtag ${formatDateShort(t.dueDate)}`
                              : undefined
                          }
                        >
                          {due}
                        </span>
                      ) : null}
                    </div>
                  </Button>
                  {t.cardCode ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-auto self-center rounded-none px-2 text-[0.625rem] font-semibold",
                        rowFill,
                        active
                          ? "hover:bg-orange-50 dark:hover:bg-orange-950"
                          : "hover:bg-muted dark:hover:bg-muted"
                      )}
                      onClick={() => openAkte(t)}
                    >
                      Akte
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

      </div>
      )}

      {flyoutPortalReady && ticketFlyoutPresence.mounted
        ? createPortal(
            <div className="fixed inset-0 z-[1000]">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "absolute inset-0 h-auto w-full rounded-none border-0 bg-black/20 p-0 transition-opacity ease-in-out hover:bg-black/20",
                  ticketFlyoutPresence.entered ? "opacity-100" : "opacity-0"
                )}
                style={{ transitionDuration: `${MARI_FLYOUT_MS}ms` }}
                aria-label="Flyout schliessen"
                onClick={closeTicketFlyout}
              />
              <MariMainFlyoutShell open={ticketFlyoutPresence.entered}>
                <MariTicketFlyoutRail
                  openIds={secondaryFlyouts}
                  onToggle={toggleSecondary}
                  hiddenIds={
                    ticketReview ? ["buchen", "buchungen"] : undefined
                  }
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {detailLoading && !detail ? (
                    <>
                      <div className="flex shrink-0 items-center justify-end border-b border-border/50 px-3 py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={closeTicketFlyout}
                          aria-label="Schliessen"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                        Lade Ticket…
                      </div>
                    </>
                  ) : detail ? (
                    <>
                      <div
                        className={cn(
                          "flex shrink-0 items-start gap-2.5 px-4 py-2",
                          statusDetailHeaderClass(detail.status)
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.6875rem] font-semibold tabular-nums text-current/70">
                            #{detail.issueId}
                          </p>
                          <h2 className="text-[0.9375rem] font-bold leading-snug tracking-tight">
                            {detail.briefDescription}
                          </h2>
                        </div>
                        {detail.cardCode ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="mt-0.5 shrink-0 text-current hover:bg-black/5"
                            onClick={() => openAkte(detail)}
                          >
                            <FolderOpen className="size-3" />
                            Akte
                          </Button>
                        ) : null}
                        <StatusChip
                          status={detail.status}
                          statusName={detail.statusName}
                          className="mt-0.5"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0 text-current hover:bg-black/5"
                                disabled={patching}
                              />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Status setzen</DropdownMenuLabel>
                              {TICKET_EDIT_STATUS_IDS.map((id) => (
                                <DropdownMenuItem
                                  key={id}
                                  disabled={patching || detail.status === id}
                                  onClick={() => void patchTicket({ status: id })}
                                >
                                  {STATUS_LABELS[id] || id}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {ticketReview ? (
                          <TicketReviewToggle
                            active={ticketReview}
                            onToggle={toggleTicketReview}
                            compact
                          />
                        ) : null}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0 text-current hover:bg-black/5"
                          onClick={closeTicketFlyout}
                          aria-label="Schliessen"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>

                      <div className="shrink-0 space-y-2.5 border-b border-border/50 px-4 py-2.5">
                        <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2">
                          <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            <DetailField label="Typ">
                              {detail.issueTypeName || "–"}
                            </DetailField>
                            <DetailField label="Produkt">
                              {detail.productName || "–"}
                            </DetailField>
                            <DetailField label="Matchcode">
                              {detail.addressMatchcode || "–"}
                            </DetailField>
                            <DetailField label="Projekt">
                              {detail.projectNumber ? (
                                <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
                                  {(
                                    detail.addressMatchcode || detail.cardCode
                                  )?.trim() ? (
                                    <>
                                      <MariCustomerChip>
                                        {(
                                          detail.addressMatchcode ||
                                          detail.cardCode
                                        )!.trim()}
                                      </MariCustomerChip>
                                      <span className="font-medium tabular-nums text-muted-foreground">
                                        ({detail.projectNumber})
                                      </span>
                                    </>
                                  ) : (
                                    <span className="font-medium tabular-nums">
                                      {detail.projectNumber}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "–"
                              )}
                            </DetailField>
                            <DetailField label="Vertrag">
                              {detail.contractNumber ||
                                (detail.contractId != null
                                  ? String(detail.contractId)
                                  : "–")}
                            </DetailField>
                            <DetailField label="Phase">
                              {detail.phaseName ||
                                (detail.phaseId != null
                                  ? String(detail.phaseId)
                                  : "–")}
                            </DetailField>
                            <DetailField label="Prio">
                              <span className="inline-flex items-center gap-1">
                                <Flag className="size-3 shrink-0 text-muted-foreground" />
                                {detail.priorityName}
                              </span>
                            </DetailField>
                            <DetailField label="Adresse">
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <User className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">
                                  {detail.cardCode || "–"}
                                </span>
                              </span>
                            </DetailField>
                            <DetailField label="Zuständig">
                              {detail.handledByName || detail.handledBy || "–"}
                            </DetailField>
                            <DetailField label="Supportgruppe">
                              {detail.supportGroupName || "–"}
                            </DetailField>
                            <DetailField label="Ansprechpartner">
                              {primaryContact(detail.contactPerson) || "–"}
                            </DetailField>
                            <DetailField label="Datum">
                              {formatDateTimeShort(detail.requestDate) || "–"}
                            </DetailField>
                            <DetailField label="Geändert am">
                              {formatDateTimeShort(detail.changeAtDate) || "–"}
                            </DetailField>
                            <DetailField label="Referenz">
                              {detail.referenceText || "–"}
                            </DetailField>
                            <DetailField label="Std. Freigabe">
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-left font-medium text-orange-900 dark:text-orange-200"
                                onClick={() => toggleSecondary("kopf")}
                                title="Ticket-Kopf bearbeiten"
                              >
                                {detail.stdFreigabe
                                  ? `${detail.stdFreigabe} h`
                                  : "–"}
                              </Button>
                            </DetailField>
                            {!ticketReview && detail.aiLabel ? (
                              <DetailField label="AI">{detail.aiLabel}</DetailField>
                            ) : null}
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                            <Calendar className="size-3.5 text-muted-foreground" />
                            <Label htmlFor="dueDate" className="sr-only">
                              Stichtag
                            </Label>
                            <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                              Stichtag
                            </p>
                            <Input
                              id="dueDate"
                              type="date"
                              className="h-7 w-auto border-border/60 bg-background px-2 shadow-none"
                              value={dueDraft}
                              onChange={(e) => setDueDraft(e.target.value)}
                              disabled={patching}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[0.6875rem]"
                              disabled={patching || !dueDraft}
                              onClick={() =>
                                void patchTicket({ dueDate: dueDraft || null })
                              }
                            >
                              Setzen
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {!ticketReview ? (
                            <>
                          {savedAnalyzedAt ? (
                            <Badge className="bg-orange-100 text-orange-900 hover:bg-orange-100 dark:bg-orange-500/20 dark:text-orange-100 dark:hover:bg-orange-500/20">
                              Analyse vorhanden ·{" "}
                              {formatAnalyzedAt(savedAnalyzedAt)}
                            </Badge>
                          ) : null}
                          {analysisInternalNotePostedAt ? (
                            <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/20">
                              Bereits als intern gespeichert
                              {savedAnalyzedAt
                                ? ` · ${formatAnalyzedAt(analysisInternalNotePostedAt)}`
                                : ""}
                            </Badge>
                          ) : null}
                          {analysis && savedAnalyzedAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-orange-300 text-orange-900 hover:bg-orange-50 dark:border-orange-400/40 dark:text-orange-200 dark:hover:bg-orange-500/15"
                              onClick={() => setAnalysisOpen((open) => !open)}
                            >
                              <Sparkles className="size-3.5" />
                              {analysisOpen
                                ? "Analyse ausblenden"
                                : "Analyse anzeigen"}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            className="bg-orange-500 text-white hover:bg-orange-600"
                            disabled={analyzing}
                            onClick={() => setAnalyzePickerOpen(true)}
                          >
                            <Sparkles className="size-3.5" />
                            {analyzing
                              ? "Analysiert…"
                              : savedAnalyzedAt
                                ? "Neu analysieren"
                                : "AI analysieren"}
                          </Button>
                            </>
                          ) : null}
                          {ticketCalendarStamp ? (
                            <div className="inline-flex items-stretch">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                title={`Termin eingeplant · ${formatStampWhen(ticketCalendarStamp)} — erneut öffnen für weiteren Termin`}
                                onClick={() => setTicketCalendarOpen(true)}
                                className="rounded-r-none border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 hover:text-emerald-950 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25 dark:hover:text-emerald-50"
                              >
                                <CalendarPlus className="size-3.5" />
                                {`Termin eingeplant (${formatStampWhen(ticketCalendarStamp)})`}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={removingTicketAppointment}
                                title="Termin entfernen"
                                aria-label={`Termin entfernen · Ticket #${detail.issueId} · ${formatStampWhen(ticketCalendarStamp)}`}
                                onClick={() => void removeTicketAppointment()}
                                className="-ml-px rounded-l-none border-emerald-300 bg-emerald-50 px-2 text-emerald-950 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:border-rose-400/40 dark:hover:bg-rose-500/20 dark:hover:text-rose-100"
                              >
                                {removingTicketAppointment ? (
                                  <Loader2
                                    className="size-3.5 animate-spin"
                                    strokeWidth={APP_ICON_STROKE}
                                  />
                                ) : (
                                  <X
                                    className="size-3.5"
                                    strokeWidth={APP_ICON_STROKE}
                                  />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              title="Termin aus Ticket — Slot suchen und anlegen"
                              onClick={() => setTicketCalendarOpen(true)}
                            >
                              <CalendarPlus className="size-3.5" />
                              Termin
                            </Button>
                          )}
                          {!ticketReview ? (
                            <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!detail.projectNumber}
                            title={
                              detail.projectNumber
                                ? "Stunden auf dieses Ticket buchen"
                                : "Ticket hat kein Projekt hinterlegt"
                            }
                            onClick={() => toggleSecondary("buchen")}
                          >
                            <Clock3 className="size-3.5" />
                            Zeit buchen
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            title="Kollegen per Teams über dieses Ticket informieren"
                            onClick={() => setColleaguePingOpen(true)}
                            className="whitespace-normal"
                          >
                            <Bell className="size-3.5" />
                            Kollege informieren
                          </Button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        {ticketCalendarStamp ? (
                          <MeetingTranscriptPanel
                            eventId={ticketCalendarStamp.eventId}
                            calendarId={ticketCalendarStamp.calendarId}
                            issueId={detail.issueId}
                            compact
                          />
                        ) : null}
                        {!ticketReview && analysis && analysisOpen ? (
                          <Card className="border-orange-200/70 bg-orange-50/40 dark:border-orange-400/30 dark:bg-orange-500/10">
                            <CardContent className="space-y-3 p-4 text-[0.8125rem]">
                              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-orange-900 dark:text-orange-100">
                                <Sparkles className="size-3.5" />
                                AI-Zusammenfassung
                              </p>
                              {savedAnalyzedAt ? (
                                <p className="text-[0.6875rem] text-orange-900/70 dark:text-orange-200/80">
                                  Gespeichert {formatAnalyzedAt(savedAnalyzedAt)}
                                </p>
                              ) : null}
                              {imagesAnalyzed > 0 ? (
                                <p className="text-[0.6875rem] text-orange-900/80 dark:text-orange-200/85">
                                  Inkl. {imagesAnalyzed} Screenshot
                                  {imagesAnalyzed === 1 ? "" : "s"} (OpenAI
                                  Vision)
                                  {imageNames.length
                                    ? `: ${imageNames.slice(0, 4).join(", ")}`
                                    : ""}
                                </p>
                              ) : (
                                <p className="text-[0.6875rem] text-muted-foreground">
                                  Textanalyse ohne Screenshot-Vision (OpenAI).
                                </p>
                              )}
                              {analysisUsageLines.length > 0 ? (
                                <div className="rounded-lg border border-orange-200/50 bg-white/50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-orange-950/80 dark:border-orange-400/25 dark:bg-black/20 dark:text-orange-100/85">
                                  <p className="font-semibold text-orange-900/90 dark:text-orange-100">
                                    Token / Kosten (nur in Buddy)
                                  </p>
                                  <ul className="mt-1 space-y-0.5">
                                    {analysisUsageLines.map((line) => (
                                      <li key={line}>{line}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              <p className="leading-relaxed">
                                {analysis.summary}
                              </p>
                              <div className="rounded-xl border border-orange-200/60 bg-white/70 px-3 py-2 dark:border-orange-400/25 dark:bg-black/20">
                                <p className="font-semibold">
                                  Vollständigkeit:{" "}
                                  {analysis.completeness.score}/100
                                </p>
                                {analysis.completeness.missing.length > 0 ? (
                                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                                    {analysis.completeness.missing.map((m) => (
                                      <li key={m}>{m}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-muted-foreground">
                                    Keine kritischen Lücken erkannt.
                                  </p>
                                )}
                                {analysis.completeness.notes ? (
                                  <p className="mt-2 text-[0.6875rem] text-muted-foreground">
                                    {analysis.completeness.notes}
                                  </p>
                                ) : null}
                              </div>
                              {analysis.recommendedStatus ? (
                                <div className="rounded-xl border border-border/50 bg-white/70 px-3 py-2 dark:bg-black/20">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-semibold">
                                        Empfohlener Status
                                      </p>
                                      <p className="mt-0.5 text-sm">
                                        {analysis.recommendedStatus.label ||
                                          (analysis.recommendedStatus.statusId
                                            ? statusChipLabel(
                                                analysis.recommendedStatus
                                                  .statusId
                                              )
                                            : "—")}
                                      </p>
                                      {analysis.recommendedStatus.reason ? (
                                        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                                          {analysis.recommendedStatus.reason}
                                        </p>
                                      ) : null}
                                    </div>
                                    {recommendedStatusId != null ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                          detail.status === recommendedStatusId
                                            ? "secondary"
                                            : "default"
                                        }
                                        disabled={
                                          patching ||
                                          detail.status === recommendedStatusId
                                        }
                                        title={
                                          detail.status === recommendedStatusId
                                            ? "Ticket hat diesen Status bereits"
                                            : `Status «${statusChipLabel(recommendedStatusId)}» nach Maringo schreiben`
                                        }
                                        onClick={() =>
                                          void applyRecommendedStatus(
                                            recommendedStatusId
                                          )
                                        }
                                      >
                                        {detail.status ===
                                        recommendedStatusId ? (
                                          <Check className="size-3.5" />
                                        ) : (
                                          <Flag className="size-3.5" />
                                        )}
                                        {detail.status === recommendedStatusId
                                          ? "Gesetzt"
                                          : "Nach Maringo schreiben"}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                              {analysis.suggestedTasks.length > 0 ? (
                                <div>
                                  <p className="font-semibold">
                                    Support-To-Dos
                                  </p>
                                  <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                                    Interne Aufgaben für uns — mit einem Klick
                                    nach Outlook To Do inkl. Ticket #{detail.issueId}.
                                  </p>
                                  <ul className="mt-2 space-y-2">
                                    {analysis.suggestedTasks.map((t) => {
                                      const adopted = Boolean(
                                        adoptedTodoKeys[t.title]
                                      );
                                      const busy = adoptingTodoKey === t.title;
                                      return (
                                      <li
                                        key={t.title}
                                        className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/10"
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium leading-snug">
                                              #{detail.issueId} {t.title}
                                            </p>
                                            {t.reason ? (
                                              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                                                {t.reason}
                                              </p>
                                            ) : null}
                                            <p className="mt-1 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                                              {t.confidence === "high"
                                                ? "Sicherheit hoch"
                                                : t.confidence === "low"
                                                  ? "Sicherheit tief"
                                                  : "Sicherheit mittel"}
                                              {t.dueHint
                                                ? ` · ${formatSwissDate(t.dueHint)}`
                                                : ""}
                                            </p>
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                              adopted ? "secondary" : "default"
                                            }
                                            disabled={busy || adopted}
                                            onClick={() =>
                                              void adoptSupportTodo(t)
                                            }
                                          >
                                            <ListTodo className="size-3.5" />
                                            {adopted
                                              ? "Übernommen"
                                              : "Als To Do übernehmen"}
                                          </Button>
                                        </div>
                                      </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              ) : null}
                              {analysis.suggestions.length > 0 ? (
                                <div>
                                  <p className="font-semibold">Vorschläge</p>
                                  <ul className="mt-1 list-disc pl-4">
                                    {analysis.suggestions.map((s) => (
                                      <li key={s}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {analysis.solutionSketch &&
                              analysis.solutionSketch.problemStillOpen ? (
                                <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 px-3 py-2.5 dark:border-sky-400/30 dark:bg-sky-500/12">
                                  <p className="font-semibold text-sky-950 dark:text-sky-100">
                                    Lösungsansatz (ausführlich)
                                  </p>
                                  {analysis.solutionSketch.vendors.length >
                                  0 ? (
                                    <p className="mt-1 text-[0.6875rem] text-sky-900/80 dark:text-sky-200/85">
                                      Hersteller:{" "}
                                      {analysis.solutionSketch.vendors.join(
                                        " · "
                                      )}
                                      {analysis.solutionSketch.confidence
                                        ? ` · Sicherheit ${
                                            analysis.solutionSketch
                                              .confidence === "high"
                                              ? "hoch"
                                              : analysis.solutionSketch
                                                    .confidence === "low"
                                                ? "tief"
                                                : "mittel"
                                          }`
                                        : ""}
                                    </p>
                                  ) : analysis.solutionSketch.confidence ? (
                                    <p className="mt-1 text-[0.6875rem] text-sky-900/80 dark:text-sky-200/85">
                                      Sicherheit{" "}
                                      {analysis.solutionSketch.confidence ===
                                      "high"
                                        ? "hoch"
                                        : analysis.solutionSketch.confidence ===
                                            "low"
                                          ? "tief"
                                          : "mittel"}
                                    </p>
                                  ) : null}
                                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-sky-950/95">
                                    {analysis.solutionSketch.outline}
                                  </pre>
                                  {analysis.solutionSketch.steps.length > 0 ? (
                                    <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs text-sky-950/95">
                                      {analysis.solutionSketch.steps.map(
                                        (s, i) => (
                                          <li
                                            key={`${s.where}-${s.action}-${i}`}
                                          >
                                            <span className="font-semibold">
                                              {s.where}
                                            </span>
                                            <span className="text-sky-900/80">
                                              {" "}
                                              —{" "}
                                            </span>
                                            {s.action}
                                            {s.detail ? (
                                              <p className="mt-0.5 text-[0.6875rem] text-sky-900/75">
                                                {s.detail}
                                              </p>
                                            ) : null}
                                          </li>
                                        )
                                      )}
                                    </ol>
                                  ) : null}
                                  {analysis.solutionSketch.artifacts.length >
                                  0 ? (
                                    <div className="mt-3 space-y-3">
                                      <div>
                                        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-sky-900/80">
                                          Queries / Skripte / Code
                                        </p>
                                        <p className="mt-0.5 text-[0.6875rem] text-sky-900/70">
                                          HANA und SQL Server immer getrennt —
                                          die Syntax weicht stark ab. Mehrere
                                          Paare sind ok (Diagnose, Fix,
                                          Verifikation).
                                        </p>
                                      </div>
                                      {groupSolutionArtifacts(
                                        analysis.solutionSketch.artifacts
                                      ).map((group, i) =>
                                        group.type === "pair" ? (
                                          <div
                                            key={`pair-${group.purpose}-${i}`}
                                            className="space-y-2"
                                          >
                                            <p className="text-xs font-semibold text-sky-950 dark:text-sky-100">
                                              {group.purpose}
                                            </p>
                                            <div className="grid gap-2 md:grid-cols-2">
                                              <SolutionArtifactCard
                                                artifact={group.hana}
                                                dialectHint="HANA"
                                              />
                                              <SolutionArtifactCard
                                                artifact={group.sqlserver}
                                                dialectHint="SQL Server"
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <SolutionArtifactCard
                                            key={`single-${group.artifact.kind}-${group.artifact.title}-${i}`}
                                            artifact={group.artifact}
                                          />
                                        )
                                      )}
                                    </div>
                                  ) : null}
                                  {analysis.solutionSketch.caveats ? (
                                    <p className="mt-2 text-[0.6875rem] text-sky-900/70">
                                      {analysis.solutionSketch.caveats}
                                    </p>
                                  ) : (
                                    <p className="mt-2 text-[0.6875rem] text-sky-900/70">
                                      Vorschlag aus allgemein verfügbarem
                                      Herstellerwissen (u.a. SAP Business One,
                                      nicht S/4) — bitte mit offizieller Doku
                                      abgleichen.
                                    </p>
                                  )}
                                </div>
                              ) : null}
                              {analysis.nextReplyDraft ? (
                                <div>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold">
                                      Antwort-Entwurf
                                      {translatingReplyDraft
                                        ? " · übersetzt…"
                                        : ""}
                                    </p>
                                    <ReplyLangToggle
                                      lang={nextReplyDraftLang}
                                      busy={
                                        translatingReplyDraft || analyzing
                                      }
                                      onChange={(next) =>
                                        void changeNextReplyDraftLanguage(next)
                                      }
                                    />
                                  </div>
                                  <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-border/50 bg-white/70 p-2.5 font-sans text-xs dark:bg-black/20">
                                    {analysis.nextReplyDraft}
                                  </pre>
                                </div>
                              ) : null}
                              <div className="flex flex-col gap-2 border-t border-orange-200/50 pt-3">
                                {analysisInternalNotePostedAt ? (
                                  <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 dark:border-emerald-400/30 dark:bg-emerald-500/12">
                                    <p className="text-xs font-semibold text-emerald-950">
                                      Bereits als intern gespeichert
                                    </p>
                                    <p className="mt-0.5 text-[0.6875rem] text-emerald-900/75">
                                      {formatAnalyzedAt(
                                        analysisInternalNotePostedAt
                                      )}{" "}
                                      · nur Support, nicht für den Kunden
                                    </p>
                                  </div>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-orange-300/80 bg-white/80 text-orange-950 hover:bg-orange-100/80 dark:border-orange-400/40 dark:bg-card dark:text-orange-100 dark:hover:bg-orange-500/15"
                                  disabled={postingInternalNote}
                                  onClick={() =>
                                    void postAnalysisAsInternalNote()
                                  }
                                >
                                  <Lock className="size-3.5" />
                                  {postingInternalNote
                                    ? "Schreibe intern…"
                                    : analysisInternalNotePostedAt
                                      ? "Erneut als intern speichern"
                                      : "Als internen Kommentar schreiben"}
                                </Button>
                                {!analysisInternalNotePostedAt ? (
                                  <p className="text-[0.6875rem] text-orange-900/75 dark:text-orange-200/80">
                                    Wird mit Flag «Internal» nach Maringo
                                    geschrieben — nur für Support sichtbar,
                                    nicht für den Kunden.
                                  </p>
                                ) : null}
                              </div>
                            </CardContent>
                          </Card>
                        ) : null}

                        {!ticketReview ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => toggleSecondary("buchungen")}
                          className="h-auto w-full flex-col items-start justify-start rounded-2xl border-border/60 bg-muted/20 px-3.5 py-3 text-left hover:bg-muted/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-[0.8125rem] font-black tracking-tight">
                                <Clock3 className="size-3.5 text-muted-foreground" />
                                Buchungen
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {ticketTimeLoading
                                  ? "Lade Buchungen…"
                                  : ticketTimeLines.length === 0
                                    ? "Noch keine Stundenbuchungen"
                                    : `${ticketTimeHoursTotal} Std · ${ticketTimeLines.length} Buchung${ticketTimeLines.length === 1 ? "" : "en"}`}
                              </p>
                            </div>
                            <span className="shrink-0 text-[0.6875rem] font-semibold text-orange-800 dark:text-orange-300">
                              Öffnen
                            </span>
                          </div>
                        </Button>
                        ) : null}

                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-[0.8125rem] font-black tracking-tight">
                            <Lock className="size-3.5 text-muted-foreground" />
                            Interner Kommentar
                          </h3>
                          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/40 px-3.5 py-3 dark:border-amber-400/30 dark:bg-amber-500/10">
                            <Label
                              htmlFor="manual-internal-note"
                              className="sr-only"
                            >
                              Interner Kommentar
                            </Label>
                            <Textarea
                              id="manual-internal-note"
                              rows={5}
                              value={manualNoteDraft}
                              onChange={(e) =>
                                setManualNoteDraft(e.target.value)
                              }
                              placeholder="Eigene Notiz fürs Support-Team (nicht für den Kunden)…"
                              disabled={postingManualNote}
                              className="resize-y border-amber-200/80 bg-white/80 text-[0.8125rem] dark:border-amber-400/30 dark:bg-card"
                            />
                            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[0.6875rem] text-amber-950/70 dark:text-amber-200/75">
                                Wird mit Flag «Internal» nach Maringo
                                geschrieben — nur intern sichtbar.
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0 border-amber-300/80 bg-white/80 text-amber-950 hover:bg-amber-100/80 dark:border-amber-400/40 dark:bg-card dark:text-amber-100 dark:hover:bg-amber-500/15"
                                disabled={
                                  postingManualNote || !manualNoteDraft.trim()
                                }
                                onClick={() => void postManualInternalNote()}
                              >
                                <Lock className="size-3.5" />
                                {postingManualNote
                                  ? "Speichere…"
                                  : "Intern speichern"}
                              </Button>
                            </div>
                            {manualNoteHint ? (
                              <p className="mt-2 text-[0.6875rem] font-medium text-emerald-800">
                                {manualNoteHint}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div>
                          <h3 className="mb-3 flex items-center gap-2 text-[0.8125rem] font-black tracking-tight">
                            <Mail className="size-3.5 text-muted-foreground" />
                            Externer Kommentar
                          </h3>
                          <div className="rounded-2xl border border-sky-200/70 bg-sky-50/40 px-3.5 py-3 dark:border-sky-400/30 dark:bg-sky-500/10">
                            <Label
                              htmlFor="manual-external-note"
                              className="sr-only"
                            >
                              Externer Kommentar
                            </Label>
                            <Textarea
                              id="manual-external-note"
                              rows={5}
                              value={externalNoteDraft}
                              onChange={(e) =>
                                setExternalNoteDraft(e.target.value)
                              }
                              placeholder="Antwort an den Kunden (sichtbar / Mail über Maringo)…"
                              disabled={
                                postingExternalNote || draftingExternalNote
                              }
                              className="resize-y border-sky-200/80 bg-white/80 text-[0.8125rem] dark:border-sky-400/30 dark:bg-card"
                            />
                            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[0.6875rem] text-sky-950/70">
                                Wird ohne «Internal» nach Maringo geschrieben —
                                Mailversand übernimmt Maringo.
                              </p>
                              <div className="flex shrink-0 flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-sky-300/80 bg-white/80 text-sky-950 hover:bg-sky-100/80 dark:border-sky-400/40 dark:bg-card dark:text-sky-100 dark:hover:bg-sky-500/15"
                                  disabled={
                                    draftingExternalNote || postingExternalNote
                                  }
                                  title="Kurzer Kundenkommentar: Eingang, ggf. fehlende Details, baldige Bearbeitung"
                                  onClick={() => void draftExternalNoteWithAi()}
                                >
                                  <Sparkles className="size-3.5" />
                                  {draftingExternalNote
                                    ? "Entwurf…"
                                    : "AI-Entwurf"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-sky-300/80 bg-white/80 text-sky-950 hover:bg-sky-100/80 dark:border-sky-400/40 dark:bg-card dark:text-sky-100 dark:hover:bg-sky-500/15"
                                  disabled={
                                    postingExternalNote ||
                                    draftingExternalNote ||
                                    !externalNoteDraft.trim()
                                  }
                                  onClick={() => void postManualExternalNote()}
                                >
                                  <Mail className="size-3.5" />
                                  {postingExternalNote
                                    ? "Sende…"
                                    : "Extern speichern"}
                                </Button>
                              </div>
                            </div>
                            {externalNoteHint ? (
                              <p className="mt-2 text-[0.6875rem] font-medium text-emerald-800">
                                {externalNoteHint}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {detail.requestTextPlain ? (
                          <div>
                            <h3 className="mb-2 flex items-center gap-2 text-[0.8125rem] font-black tracking-tight">
                              <Inbox className="size-3.5 text-muted-foreground" />
                              Anfragetext
                            </h3>
                            <div className="rounded-2xl border border-teal-200/70 bg-teal-50/40 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-50">
                              <div className="whitespace-pre-wrap">
                                {detail.requestTextPlain}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => toggleSecondary("verlauf")}
                          className="h-auto w-full items-center justify-between rounded-2xl border-border/60 bg-muted/20 px-3.5 py-3 text-left hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-[0.8125rem] font-black tracking-tight">
                              <MessageSquare className="size-3.5 text-muted-foreground" />
                              Verlauf öffnen ({detail.timeline.length})
                            </p>
                            <span className="shrink-0 text-[0.6875rem] font-semibold text-orange-800 dark:text-orange-300">
                              Öffnen
                            </span>
                          </div>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex shrink-0 items-center justify-end border-b border-border/50 px-3 py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={closeTicketFlyout}
                          aria-label="Schliessen"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                        Ticket nicht geladen
                      </div>
                    </>
                  )}
                </div>
              </MariMainFlyoutShell>

              {secondaryPresence.rendered.map((id, i) => {
                if (ticketReview && (id === "buchen" || id === "buchungen")) {
                  return null;
                }
                const meta = MARI_SECONDARY_FLYOUT_META[id];
                const widthClass =
                  id === "buchen" || id === "buchungen" || id === "kopf"
                    ? MARI_SECONDARY_FLYOUT_WIDTH_CLASS
                    : MARI_SECONDARY_FLYOUT_COMPACT_WIDTH_CLASS;
                const entered = secondaryPresence.isEntered(id);
                const openIndex = secondaryFlyouts.indexOf(id);
                const offsetBase =
                  openIndex >= 0
                    ? secondaryFlyouts.length - 1 - openIndex
                    : secondaryPresence.rendered.length - 1 - i;
                return (
                  <MariSecondaryFlyoutShell
                    key={id}
                    title={meta.label}
                    description={meta.description}
                    onClose={() => closeSecondary(id)}
                    widthClass={widthClass}
                    stretchToRail={id === "verlauf"}
                    zIndex={1010 + i}
                    offsetPx={offsetBase * 12}
                    open={entered && ticketFlyoutPresence.entered}
                  >
                    {id === "verlauf" ? (
                      <div className="space-y-3">
                        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTimelineSort("newest")}
                            className={cn(
                              "h-auto rounded-md px-2 py-1 text-[0.6875rem] font-semibold",
                              timelineSort === "newest"
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <ArrowDownAZ className="size-3.5" />
                            Aktuellste oben
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTimelineSort("oldest")}
                            className={cn(
                              "h-auto rounded-md px-2 py-1 text-[0.6875rem] font-semibold",
                              timelineSort === "oldest"
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <ArrowUpAZ className="size-3.5" />
                            Älteste oben
                          </Button>
                        </div>
                        {sortedTimeline.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                            <Inbox className="mx-auto mb-2 size-5 opacity-50" />
                            {detail?.requestTextPlain
                              ? "Noch keine weiteren Verlaufseinträge."
                              : "Kein Verlauf und kein Anfragetext vorhanden."}
                          </div>
                        ) : (
                          <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[0.7rem] before:w-px before:bg-border">
                            {sortedTimeline.map((item) => (
                              <TimelineRow
                                key={item.id}
                                item={item}
                                deletingAttachmentId={deletingAttachmentId}
                                onDeleteInternalNote={(attachmentId) =>
                                  void deleteInternalNote(attachmentId)
                                }
                              />
                            ))}
                          </ol>
                        )}
                      </div>
                    ) : null}
                    {id === "kopf" && detail ? (
                      <MaringoTicketKopfForm
                        key={`kopf-${detail.issueId}-${detail.changeAtDate || ""}`}
                        defaults={{
                          projectNumber: detail.projectNumber,
                          projectLabel: detail.projectNumber
                              ? formatMariProjectLabel(
                                  detail.projectNumber,
                                  detail.addressMatchcode || detail.cardCode
                                )
                              : "",
                          contractId: detail.contractId,
                          contractPositionId: detail.contractPositionId,
                          activity: detail.briefDescription,
                          stdFreigabe: detail.stdFreigabe,
                          contactPerson: detail.contactPerson,
                          supportGroupId: detail.supportGroupId,
                          supportGroupName: detail.supportGroupName,
                          handledBy: detail.handledBy,
                          priority: detail.priority,
                          medium: detail.medium,
                        }}
                        onSubmit={saveTicketKopf}
                      />
                    ) : null}
                    {(id === "buchen" || id === "buchungen") && detail ? (
                      <MaringoTimekeepingPanel
                        ticketIssueId={detail.issueId}
                        ticketPanel={id === "buchen" ? "book" : "lines"}
                        bookDefaults={
                          id === "buchen"
                            ? {
                                issueId: detail.issueId,
                                projectNumber: detail.projectNumber,
                                projectLabel: detail.projectNumber
                              ? formatMariProjectLabel(
                                  detail.projectNumber,
                                  detail.addressMatchcode || detail.cardCode
                                )
                              : "",
                                contractId: detail.contractId,
                                contractPositionId: detail.contractPositionId,
                                activity: detail.briefDescription.slice(0, 100),
                                hours: 0.25,
                                hoursBillable: 0.25,
                                billable: true,
                              }
                            : null
                        }
                        onTicketLinesChange={(lines) => {
                          setTicketTimeLines(lines);
                        }}
                      />
                    ) : null}
                    {id === "anzeige" ? (
                      <div className="space-y-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Felder in der Ticketliste (Meta-Zeile).
                          {ticketReview
                            ? null
                            : " Vorhandene Werte werden bei «Zeit buchen» vorbelegt und können dort überschrieben werden."}
                        </p>
                        <ul className="space-y-1.5">
                          {MARI_LIST_META_FIELD_OPTIONS.map((opt) => {
                            const checked = listMetaFields.includes(opt.id);
                            return (
                              <li key={opt.id}>
                                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5 hover:bg-muted/30">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={checked}
                                    onChange={() => {
                                      setListMetaFields((prev) => {
                                        if (prev.includes(opt.id)) {
                                          const next = prev.filter(
                                            (x) => x !== opt.id
                                          );
                                          return next.length > 0
                                            ? next
                                            : [...DEFAULT_MARI_LIST_META_FIELDS];
                                        }
                                        const order =
                                          MARI_LIST_META_FIELD_OPTIONS.map(
                                            (o) => o.id
                                          );
                                        return [...prev, opt.id].sort(
                                          (a, b) =>
                                            order.indexOf(a) - order.indexOf(b)
                                        );
                                      });
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-[0.8125rem] font-semibold">
                                      {opt.label}
                                    </span>
                                    <span className="block text-[0.6875rem] text-muted-foreground">
                                      {opt.hint}
                                    </span>
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </MariSecondaryFlyoutShell>
                );
              })}
            </div>,
            document.body
          )
        : null}

      <TicketColleaguePingDialog
        open={colleaguePingOpen && detail != null && !ticketReview}
        onOpenChange={setColleaguePingOpen}
        issueId={detail?.issueId ?? 0}
        ticketLabel={detail?.briefDescription ?? ""}
      />

      <TicketAnalyzeAttachmentPicker
        open={analyzePickerOpen && !ticketReview}
        onOpenChange={setAnalyzePickerOpen}
        timeline={detail?.timeline ?? []}
        analyzing={analyzing}
        onConfirm={({ attachmentIds, products }) => {
          setAnalyzePickerOpen(false);
          void runAnalyze({
            includeImages: attachmentIds.length > 0,
            attachmentIds,
            products,
          });
        }}
      />

      <MaringoTimeBookDialog
        open={
          bookDialogOpen && !(ticketReview && workspaceTab === "tickets")
        }
        onOpenChange={(open) => {
          setBookDialogOpen(open);
          if (!open) {
            setEditBookLineId(null);
            setEditBookDefaults(null);
            setPendingStampBook(null);
          }
        }}
        defaults={
          editBookDefaults ||
          (detail
            ? {
                issueId: detail.issueId,
                projectNumber: detail.projectNumber,
                projectLabel: detail.projectNumber
                              ? formatMariProjectLabel(
                                  detail.projectNumber,
                                  detail.addressMatchcode || detail.cardCode
                                )
                              : "",
                contractId: detail.contractId,
                contractPositionId: detail.contractPositionId,
                activity: detail.briefDescription.slice(0, 100),
                hours: 0.25,
                hoursBillable: 0.25,
                billable: true,
              }
            : null)
        }
        title={
          editBookLineId
            ? `Buchung ändern · #${editBookLineId}`
            : pendingStampBook
              ? `Stunden aus Termin · Ticket #${pendingStampBook.issueId}`
              : detail
                ? `Zeit buchen · Ticket #${detail.issueId}`
                : "Zeit buchen"
        }
        description={
          editBookLineId
            ? "Speichern ersetzt die Zeile in MARI. Ticket-Verknüpfung bleibt erhalten."
            : pendingStampBook
              ? "Vorschlag aus gestempeltem Ticket-Termin — prüfen und buchen."
              : "Buchung wird mit SourceReference auf dieses Ticket verknüpft."
        }
        submitLabel={editBookLineId ? "Speichern" : "Auf Ticket buchen"}
        editLineId={editBookLineId}
        onBooked={() => {
          const stamp = pendingStampBook;
          if (stamp) {
            void fetch("/api/maringo/timekeeping/suggestions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                eventProvider: stamp.eventProvider,
                eventId: stamp.eventId,
                status: "booked",
              }),
            }).catch(() => undefined);
          }
          setPendingStampBook(null);
          setSuggestionsRefresh((n) => n + 1);
          if (selectedId != null) void loadTicketTimeLines(selectedId);
        }}
      />

      <AdhocEventDialog
        open={ticketCalendarOpen}
        onOpenChange={setTicketCalendarOpen}
        mariIssueId={detail?.issueId ?? null}
        onCreated={() => {
          const id = detail?.issueId;
          void loadList();
          setSuggestionsRefresh((n) => n + 1);
          if (id == null) return;
          void reloadTicketCalendarStamp(id);
        }}
        initialTitle={
          detail
            ? `#${detail.issueId} · ${detail.briefDescription}`.slice(0, 200)
            : null
        }
        initialNotes={
          analysis?.summary?.trim() ||
          detail?.briefDescription ||
          null
        }
        defaultDurationMinutes={60}
        dialogTitle={
          detail ? `Termin · Ticket #${detail.issueId}` : "Termin aus Ticket"
        }
        dialogDescription="Freien Slot suchen, Termin anlegen — wird für die Abend-Stundenbuchung gestempelt."
      />
    </div>
  );
}
