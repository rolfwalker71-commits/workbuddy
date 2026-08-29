"use client";

import { useEffect, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";
import { showActionFeedback } from "@/lib/ui/action-feedback";

type AiAction = "suggest" | "shorter" | "formal" | "toDe" | "toEn";

export function MicrosoftMailComposeDialog({
  open,
  onOpenChange,
  mode = "new",
  sourceMailId,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "new" | "reply";
  sourceMailId?: string | null;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  onSent?: () => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [hint, setHint] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const [usageLine, setUsageLine] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo);
    setSubject(defaultSubject);
    setBody(defaultBody);
    setHint("");
    setError(null);
    setUsageLine(null);
    void (async () => {
      try {
        const res = await fetch("/api/microsoft/mail/signature");
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          const text = String(
            (json as { signature?: { text?: string; appendOnSend?: boolean } })
              .signature?.text || ""
          ).trim();
          setHasSignature(Boolean(text));
          setIncludeSignature(
            Boolean(
              (json as { signature?: { appendOnSend?: boolean } }).signature
                ?.appendOnSend !== false
            )
          );
        }
      } catch {
        /* ignore */
      }
    })();
  }, [open, defaultTo, defaultSubject, defaultBody]);

  async function runAi(action: AiAction) {
    if (action !== "suggest" && !body.trim()) {
      setError(t("microsoft.enterTextFirst"));
      return;
    }
    setAiBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/compose-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          mode,
          sourceMailId: mode === "reply" ? sourceMailId : null,
          to,
          subject,
          body,
          hint: hint.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || t("microsoft.mailAiFailed")
        );
      }
      if (typeof json.subject === "string") setSubject(json.subject);
      if (typeof json.body === "string") setBody(json.body);
      setUsageLine(
        typeof json.usageLine === "string" && json.usageLine
          ? `DeepSeek · ${json.usageLine}`
          : t("microsoft.tokenCostUnknown")
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: t("microsoft.mailAiFailed"),
        detail: message,
        tone: "error",
      });
    } finally {
      setAiBusy(null);
    }
  }

  async function submit(send: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          sourceMailId: mode === "reply" ? sourceMailId : null,
          includeSignature,
          send,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || t("microsoft.sendFailed")
        );
      }
      showActionFeedback({
        headline: send ? t("microsoft.mailSent") : t("microsoft.draftInOutlook"),
        detail: subject || "Outlook",
        tone: "success",
      });
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: t("microsoft.mailFailed"),
        detail: message,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const blocked = busy || Boolean(aiBusy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base">
            {mode === "reply" ? t("microsoft.sendReply") : t("mail.compose")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("microsoft.outlookSend")}
            {hasSignature ? t("microsoft.buddySignature") : ""}
            {" · "}{t("microsoft.aiViaDeepSeek")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="ms-mail-to">{t("mail.to")}</Label>
            <Input
              id="ms-mail-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t("microsoft.toPlaceholder")}
              disabled={blocked}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-mail-subject">{t("mail.subject")}</Label>
            <Input
              id="ms-mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={blocked}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ms-mail-hint">{t("microsoft.aiHint")}</Label>
            <Input
              id="ms-mail-hint"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={t("microsoft.aiHintPlaceholder")}
              disabled={blocked}
            />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="ms-mail-body">{t("mail.body")}</Label>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={blocked}
                  onClick={() => void runAi("suggest")}
                  className="h-7 gap-1 px-2 text-[0.6875rem]"
                >
                  <Sparkles
                    className="size-3"
                    strokeWidth={APP_ICON_STROKE}
                  />
                  {aiBusy === "suggest" ? "…" : t("microsoft.suggest")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={blocked || !body.trim()}
                  onClick={() => void runAi("shorter")}
                  className="h-7 px-2 text-[0.6875rem]"
                >
                  {aiBusy === "shorter" ? "…" : t("microsoft.shorter")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={blocked || !body.trim()}
                  onClick={() => void runAi("formal")}
                  className="h-7 px-2 text-[0.6875rem]"
                >
                  {aiBusy === "formal" ? "…" : t("microsoft.moreFormal")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={blocked || !body.trim()}
                  onClick={() => void runAi("toDe")}
                  className="h-7 px-2 text-[0.6875rem]"
                >
                  {aiBusy === "toDe" ? "…" : "DE"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={blocked || !body.trim()}
                  onClick={() => void runAi("toEn")}
                  className="h-7 px-2 text-[0.6875rem]"
                >
                  {aiBusy === "toEn" ? "…" : "EN"}
                </Button>
              </div>
            </div>
            <Textarea
              id="ms-mail-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={blocked}
            />
            {usageLine ? (
              <p className="text-[0.6875rem] text-muted-foreground" title={t("microsoft.listPriceApprox")}>
                {t("common.tokens", { line: usageLine })}
              </p>
            ) : (
              <p className="text-[0.6875rem] text-muted-foreground">
                {t("microsoft.aiCostHint")}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeSignature}
              onChange={(e) => setIncludeSignature(e.target.checked)}
              disabled={blocked || !hasSignature}
            />
            {t("microsoft.attachSignature")}
            {!hasSignature ? t("microsoft.noSignatureYet") : ""}
          </label>
        </div>
        <DialogFooter className="gap-2 border-t border-border/60 px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={blocked || !to.trim() || !body.trim()}
            onClick={() => void submit(false)}
          >
            {t("microsoft.asDraft")}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={blocked}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={blocked || !to.trim() || !body.trim()}
              onClick={() => void submit(true)}
              className="gap-1.5"
            >
              <Send className="size-3.5" strokeWidth={APP_ICON_STROKE} />
              {busy ? t("common.sending") : t("common.send")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
