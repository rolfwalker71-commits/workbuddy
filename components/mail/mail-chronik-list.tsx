"use client";

import { useCallback, useMemo, useState } from "react";
import { EyeOff, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MicrosoftMailComposeDialog } from "@/components/microsoft/microsoft-mail-compose-dialog";
import { MicrosoftMailQuickActions } from "@/components/microsoft/microsoft-mail-quick-actions";
import { MailTicketImportDialog } from "@/components/mail/mail-ticket-import-dialog";
import { MailHtmlBody } from "@/components/mail/mail-html-body";
import { cn } from "@/lib/utils";
import type { MsMailItem } from "@/lib/microsoft/mail-day";
import type { MailMessageDetail } from "@/lib/mail/gmail";
import {
  MailSenderBlacklistOpenButton,
  MailSenderBlacklistSheet,
  useMailSenderBlacklist,
} from "@/components/mail/mail-sender-blacklist-editor";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  buildMailChronikThreads,
  chronikDateTimeLabel,
  filterVisibleMails,
  normalizeMailSenderEmail,
} from "@/lib/mail/mail-threads";
import { formatSwissDateTime } from "@/lib/utils/dates";
import { useT } from "@/components/i18n/locale-provider";
import { ProviderBadge } from "@/components/workspace/provider-badge";

export type MailChronikProvider = "microsoft" | "google";

function formatDetailWhen(detail: MailMessageDetail): string {
  if (detail.internalDate) {
    const d = new Date(Number(detail.internalDate));
    if (Number.isFinite(d.getTime())) {
      return formatSwissDateTime(d.toISOString());
    }
  }
  return formatSwissDateTime(detail.date);
}

export function mergeMailChronik(
  inbox: MsMailItem[],
  sent: MsMailItem[]
): MsMailItem[] {
  return [...inbox, ...sent];
}

export function countMailsInRange(
  items: MsMailItem[],
  folder?: "inbox" | "sent"
): number {
  return items.filter(
    (m) =>
      m.inRange !== false && (folder == null || m.folder === folder)
  ).length;
}

export function MailChronikSummary({
  rangeLabel,
  inboxCount,
  sentCount,
}: {
  rangeLabel: string;
  inboxCount: number;
  sentCount: number;
}) {
  const t = useT();
  return (
    <p className="px-1 text-sm font-semibold tracking-tight">
      {rangeLabel}
      <span className="font-normal text-muted-foreground"> · </span>
      <span className="font-semibold text-teal-800">{t("mail.inboxCount", { count: inboxCount })}</span>
      <span className="font-normal text-muted-foreground"> · </span>
      <span className="font-semibold text-amber-800">{t("mail.sentCount", { count: sentCount })}</span>
    </p>
  );
}

type ChronikMail = MsMailItem & { provider?: MailChronikProvider };

function MailChronikRow({
  mail,
  indented,
  onOpen,
  listProvider,
}: {
  mail: ChronikMail;
  indented: boolean;
  onOpen: (m: ChronikMail) => void;
  listProvider: MailChronikProvider;
}) {
  const t = useT();
  const isInbox = mail.folder === "inbox";
  const isContext = mail.inRange === false;
  const partyName = isInbox
    ? mail.from || mail.fromEmail || t("common.unknown")
    : mail.toPreview?.split("<")[0]?.trim() ||
      mail.toEmails[0] ||
      t("common.recipient");
  const partyEmail = isInbox ? mail.fromEmail : mail.toEmails[0] || null;
  const headline = `${partyName} · ${mail.subject || t("common.noSubject")}`;
  const sub = isInbox
    ? partyEmail || partyName
    : partyEmail
      ? t("mail.toWithEmail", { name: partyName, email: partyEmail })
      : t("common.toName", { name: partyName });

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onOpen(mail)}
      className={cn(
        "h-auto w-full min-w-0 items-start justify-start gap-3 whitespace-normal px-3.5 py-3 text-left transition-colors hover:bg-muted dark:hover:bg-muted",
        indented && "border-l-2 border-border/60 pl-5 sm:pl-6",
        isContext && "text-muted-foreground"
      )}
    >
      <div className="flex w-[4.25rem] shrink-0 flex-col items-start gap-1">
        <Badge
          variant="outline"
          className={cn(
            "mt-0.5 h-5 rounded-md px-1.5 text-[0.625rem] font-semibold",
            isContext
              ? "border-border/70 bg-background/70 text-muted-foreground"
              : isInbox
                ? "border-teal-200/80 bg-teal-50 text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/15 dark:text-teal-100"
                : "border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100"
          )}
        >
          {isInbox ? t("mail.inboxShort") : t("mail.sent")}
        </Badge>
        {isContext ? (
          <span className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground/90">
            {t("common.context")}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 break-words text-sm leading-snug",
              isContext
                ? "font-normal"
                : isInbox && !mail.isRead
                  ? "font-semibold"
                  : "font-medium"
            )}
          >
            {headline}
          </p>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums",
              isContext ? "text-muted-foreground/80" : "text-muted-foreground"
            )}
          >
            {chronikDateTimeLabel(mail.receivedOrSentAt)}
          </span>
        </div>
        <p
          className={cn(
            "mt-0.5 break-words text-xs",
            isContext ? "text-muted-foreground/80" : "text-muted-foreground"
          )}
        >
          {sub}
        </p>
        {mail.provider || listProvider ? (
          <div className="mt-1">
            <ProviderBadge
              provider={mail.provider || listProvider}
              kind="mail"
            />
          </div>
        ) : null}
      </div>
    </Button>
  );
}

export function MailChronikList({
  items,
  loading,
  provider,
  onItemsChanged,
  showBlacklistButton = true,
  blacklistOpen,
  onBlacklistOpenChange,
}: {
  items: ChronikMail[];
  loading?: boolean;
  provider: MailChronikProvider;
  onItemsChanged?: () => void;
  showBlacklistButton?: boolean;
  blacklistOpen?: boolean;
  onBlacklistOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openProvider, setOpenProvider] = useState<MailChronikProvider>(provider);
  const [webLink, setWebLink] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<"inbox" | "sent" | null>(null);
  const [openFromEmail, setOpenFromEmail] = useState<string | null>(null);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [ticketImportOpen, setTicketImportOpen] = useState(false);
  const [ticketImportMail, setTicketImportMail] = useState<{
    messageId?: string | null;
    from?: string | null;
    fromName?: string | null;
    subject?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    snippet?: string | null;
    bodyContentType?: "html" | "text" | null;
  } | null>(null);
  const [blacklistSheetOpenUncontrolled, setBlacklistSheetOpenUncontrolled] =
    useState(false);
  const blacklistControlled = blacklistOpen !== undefined;
  const blacklistSheetOpen = blacklistControlled
    ? blacklistOpen
    : blacklistSheetOpenUncontrolled;
  const setBlacklistSheetOpen = (open: boolean) => {
    if (!blacklistControlled) setBlacklistSheetOpenUncontrolled(open);
    onBlacklistOpenChange?.(open);
  };
  const [blacklistBusy, setBlacklistBusy] = useState(false);
  const blacklist = useMailSenderBlacklist();

  const visibleItems = useMemo(
    () => filterVisibleMails(items, { blacklistEmails: blacklist.emails }),
    [items, blacklist.emails]
  );
  const threads = useMemo(
    () => buildMailChronikThreads(visibleItems),
    [visibleItems]
  );
  const hasInRange = visibleItems.some((m) => m.inRange !== false);
  const hiddenFromView = items.length - visibleItems.length;

  const openMail = useCallback(
    async (item: ChronikMail) => {
      const itemProvider = item.provider || provider;
      setOpenProvider(itemProvider);
      setOpenId(item.id);
      setWebLink(item.webLink);
      setOpenFolder(item.folder);
      setOpenFromEmail(item.fromEmail || null);
      setOpenSubject(item.subject || null);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        if (itemProvider === "google") {
          setDetail({
            id: item.id,
            threadId: item.conversationId || item.id,
            from: item.fromEmail || item.from,
            fromName: item.from,
            subject: item.subject,
            snippet: item.preview,
            date: item.receivedOrSentAt,
            internalDate: item.receivedOrSentAt
              ? String(new Date(item.receivedOrSentAt).getTime())
              : null,
            unread: !item.isRead,
            to: item.toPreview,
            bodyHtml: null,
            bodyText: item.bodyText || item.preview,
          });
          return;
        }
        const res = await fetch(
          `/api/microsoft/mail/${encodeURIComponent(item.id)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error || t("mail.loadFailed")
          );
        }
        setDetail((data as { message: MailMessageDetail }).message);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [provider, t]
  );

  const openSenderEmail =
    normalizeMailSenderEmail(detail?.from) ||
    normalizeMailSenderEmail(openFromEmail);
  const openSenderName = detail?.fromName || detail?.from || null;
  const canBlacklist =
    openFolder !== "sent" && Boolean(openSenderEmail) && Boolean(openId);

  async function blacklistOpenSender() {
    if (!openSenderEmail) return;
    setBlacklistBusy(true);
    try {
      await blacklist.add({
        email: openSenderEmail,
        name: openSenderName,
      });
      showActionFeedback({
        headline: t("mail.senderHidden"),
        detail: t("mail.senderHiddenDetail", { email: openSenderEmail }),
        tone: "success",
      });
      setOpenId(null);
      setDetail(null);
      onItemsChanged?.();
    } catch (err) {
      showActionFeedback({
        headline: t("common.hideFailed"),
        detail: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setBlacklistBusy(false);
    }
  }

  const hideBar = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <p className="text-xs leading-snug text-muted-foreground">
        {t("mail.systemHidden", {
          hidden:
            hiddenFromView > 0
              ? t("mail.hiddenCount", { count: hiddenFromView })
              : "",
          own:
            blacklist.entries.length > 0
              ? t("mail.ownSenders", { count: blacklist.entries.length })
              : "",
        })}
      </p>
      {showBlacklistButton ? (
        <MailSenderBlacklistOpenButton
          onClick={() => setBlacklistSheetOpen(true)}
        />
      ) : null}
    </div>
  );

  const blacklistSheet = (
    <MailSenderBlacklistSheet
      open={blacklistSheetOpen}
      onOpenChange={setBlacklistSheetOpen}
      list={blacklist}
      onChanged={() => onItemsChanged?.()}
    />
  );

  if (loading && items.length === 0) {
    return (
      <>
        <p className="text-sm text-muted-foreground" role="status">
          {t("mail.loadingMails")}
        </p>
        {blacklistSheet}
      </>
    );
  }
  if (!hasInRange) {
    return (
      <div className="space-y-3">
        {hideBar}
        <div className="rounded-2xl border border-dashed border-border/70 bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
          {items.length > 0
            ? t("mail.noneVisible")
            : t("mail.noneInRange")}
        </div>
        {blacklistSheet}
      </div>
    );
  }

  const externalLabel =
    openProvider === "microsoft" ? t("mail.openInOutlook") : t("mail.openInGmail");

  return (
    <>
      {hideBar}
      <ul className="space-y-3">
        {threads.map((thread) => {
          const contextCount = thread.mails.filter(
            (m) => m.inRange === false
          ).length;
          const isThread = thread.mails.length > 1;
          return (
            <li key={thread.key}>
              <article
                className={cn(
                  "overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10",
                )}
              >
                {isThread ? (
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted px-3.5 py-2">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("mail.threadMails", { count: thread.mails.length })}
                      {contextCount > 0
                        ? t("mail.threadContext", { count: contextCount })
                        : ""}
                    </p>
                  </div>
                ) : null}
                <ul>
                  {thread.mails.map((m, idx) => (
                    <li
                      key={`${m.folder}-${m.id}`}
                      className={cn(idx > 0 && "border-t border-border/35")}
                    >
                      <MailChronikRow
                        mail={m}
                        indented={idx > 0}
                        listProvider={provider}
                        onOpen={(item) => void openMail(item)}
                      />
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={Boolean(openId)}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setDetail(null);
            setDetailError(null);
            setWebLink(null);
            setOpenFolder(null);
            setOpenFromEmail(null);
            setOpenSubject(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[min(96vw,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base leading-snug">
              {detail?.subject ||
                (detailLoading ? t("common.loading") : t("workspace.mail"))}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {detail
                ? `${detail.fromName || detail.from || "—"}${
                    detail.from && detail.fromName
                      ? ` <${detail.from}>`
                      : ""
                  }${formatDetailWhen(detail) ? ` · ${formatDetailWhen(detail)}` : ""}`
                : openProvider === "microsoft"
                  ? t("mail.outlookMessage")
                  : t("mail.gmailMessage")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {webLink ? (
                <a
                  href={webLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5"
                  )}
                >
                  <ExternalLink className="size-3.5" />
                  {externalLabel}
                </a>
              ) : null}
              {canBlacklist ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={blacklistBusy}
                  onClick={() => void blacklistOpenSender()}
                >
                  <EyeOff className="size-3.5" strokeWidth={APP_ICON_STROKE} />
                  {t("mail.hideSender")}
                </Button>
              ) : null}
              {openProvider === "microsoft" && openId ? (
                <MicrosoftMailQuickActions
                  messageId={openId}
                  unread={detail?.unread}
                  folder={openFolder}
                  onReply={() => setComposeOpen(true)}
                  onCreateTicket={() => {
                    setTicketImportMail({
                      messageId: openId,
                      from: detail?.from || openFromEmail,
                      fromName: detail?.fromName || null,
                      subject: detail?.subject || openSubject,
                      bodyHtml: detail?.bodyHtml || null,
                      bodyText: detail?.bodyText || detail?.snippet || null,
                      snippet: detail?.snippet || null,
                      bodyContentType: detail?.bodyContentType || null,
                    });
                    setTicketImportOpen(true);
                    setOpenId(null);
                  }}
                  onChanged={(action) => {
                    if (
                      action === "archive" ||
                      action === "delete" ||
                      action === "markRead"
                    ) {
                      if (action === "archive" || action === "delete") {
                        setOpenId(null);
                      }
                      onItemsChanged?.();
                    }
                  }}
                />
              ) : null}
            </div>
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">{t("mail.loadingBody")}</p>
            ) : detailError ? (
              <p className="text-sm text-rose-800">{detailError}</p>
            ) : detail ? (
              <div className="space-y-3">
                {detail.to ? (
                  <p className="text-xs text-muted-foreground">
                    {t("mail.toPrefix", { to: detail.to })}
                  </p>
                ) : null}
                <MailHtmlBody
                  html={detail.bodyHtml}
                  plainFallback={detail.bodyText || detail.snippet}
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {openProvider === "microsoft" ? (
        <MicrosoftMailComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          mode="reply"
          sourceMailId={openId}
          defaultTo={openFromEmail || detail?.from || ""}
          defaultSubject={
            openSubject
              ? openSubject.toLowerCase().startsWith("re:")
                ? openSubject
                : `Re: ${openSubject}`
              : ""
          }
          defaultBody=""
          onSent={() => onItemsChanged?.()}
        />
      ) : null}

      {openProvider === "microsoft" ? (
        <MailTicketImportDialog
          open={ticketImportOpen}
          onOpenChange={setTicketImportOpen}
          mail={ticketImportMail}
        />
      ) : null}

      {blacklistSheet}
    </>
  );
}
