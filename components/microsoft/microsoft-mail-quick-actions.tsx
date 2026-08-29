"use client";

import { useState } from "react";
import {
  Archive,
  CheckSquare,
  Flag,
  MailOpen,
  Mail,
  Reply,
  Ticket,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

type MutateAction =
  | "markRead"
  | "markUnread"
  | "archive"
  | "delete"
  | "flag"
  | "createTodo";

export function MicrosoftMailQuickActions({
  messageId,
  unread,
  folder,
  onReply,
  onCreateTicket,
  onChanged,
  className,
}: {
  messageId: string;
  unread?: boolean;
  folder?: "inbox" | "sent" | string | null;
  onReply?: () => void;
  onCreateTicket?: () => void;
  onChanged?: (action: MutateAction) => void;
  className?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const isSent = folder === "sent";

  async function run(action: MutateAction, label: string) {
    if (action === "delete") {
      if (!window.confirm(t("microsoft.confirmDeleteMail"))) return;
    }
    setBusy(action);
    try {
      const res = await fetch(
        `/api/microsoft/mail/${encodeURIComponent(messageId)}/mutate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || t("common.actionFailed")
        );
      }
      showActionFeedback({
        headline: label,
        detail:
          action === "createTodo"
            ? t("microsoft.inToDoAndFlag")
            : "Outlook",
        tone: "success",
      });
      onChanged?.(action);
    } catch (err) {
      showActionFeedback({
        headline: t("microsoft.mailActionFailed"),
        detail: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {onReply ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={onReply}
          className="gap-1.5"
        >
          <Reply className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          {t("common.reply")}
        </Button>
      ) : null}
      {onCreateTicket ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={onCreateTicket}
          className="gap-1.5"
        >
          <Ticket className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          {t("microsoft.createTicket")}
        </Button>
      ) : null}
      {!isSent ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() =>
            void run(
              unread ? "markRead" : "markUnread",
              unread ? t("microsoft.markedRead") : t("microsoft.markedUnread")
            )
          }
          className="gap-1.5"
        >
          {unread ? (
            <MailOpen className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          ) : (
            <Mail className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          )}
          {unread ? t("microsoft.read") : t("microsoft.unread")}
        </Button>
      ) : null}
      {!isSent ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => void run("archive", t("microsoft.archived"))}
          className="gap-1.5"
        >
          <Archive className="size-3.5" strokeWidth={APP_ICON_STROKE} />
          {t("microsoft.archive")}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() => void run("flag", t("microsoft.flagged"))}
        className="gap-1.5"
      >
        <Flag className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        Flag
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() => void run("createTodo", t("microsoft.createdInToDo"))}
        className="gap-1.5"
      >
        <CheckSquare className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        To Do
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() => void run("delete", t("microsoft.deleted"))}
        className="gap-1.5 text-rose-800"
      >
        <Trash2 className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        {t("common.delete")}
      </Button>
    </div>
  );
}
