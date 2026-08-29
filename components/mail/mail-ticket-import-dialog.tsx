"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Ticket } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MailHtmlImportEditor } from "@/components/mail/mail-html-import-editor";
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";
import { parseMailSender } from "@/lib/mail/mail-contact";
import {
  initialMailTicketDescription,
  MAIL_TICKET_HTML_MAX,
  stripOutlookSignatureImages,
} from "@/lib/mail/strip-signature-images";
import type { MariEmailPartnerSuggestion } from "@/lib/mari/customers";
import { parseMariCompanyId } from "@/lib/mari/companies-shared";
import {
  formatMariProjectLabel,
  looksLikeMariProjectNumber,
  sanitizeMariProjectNumber,
  type MariKeyPair,
} from "@/lib/mari/timekeeping-shared";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { cn } from "@/lib/utils";

export type MailTicketImportSource = {
  messageId?: string | null;
  from?: string | null;
  fromName?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  snippet?: string | null;
  /** Graph body.contentType — html vs text. */
  bodyContentType?: "html" | "text" | null;
};

type MailAttachRow = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  isInline?: boolean;
  contentId?: string | null;
};

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  );
}

function FieldGroup({
  title,
  required,
  hint,
  children,
}: {
  title: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <header>
        <h3 className="text-sm font-semibold leading-snug">
          {title}
          {required ? <RequiredMark /> : null}
        </h3>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MailTicketImportDialog({
  open,
  onOpenChange,
  mail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mail: MailTicketImportSource | null;
}) {
  const t = useT();
  const sender = parseMailSender({
    from: mail?.from,
    fromName: mail?.fromName,
  });
  const [contactName, setContactName] = useState(sender.name);
  const [contactEmail, setContactEmail] = useState(sender.email);
  const [subject, setSubject] = useState((mail?.subject || "").trim());
  const [body, setBody] = useState("");
  const [rawHtml, setRawHtml] = useState("");
  const [isHtml, setIsHtml] = useState(false);
  const [htmlSyncKey, setHtmlSyncKey] = useState("0");
  const [strippedContentIds, setStrippedContentIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<MariEmailPartnerSuggestion[]>(
    []
  );
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "done" | "empty"
  >("idle");
  const [cardCode, setCardCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectNumber, setProjectNumber] = useState("");
  const [projectLabel, setProjectLabel] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [contracts, setContracts] = useState<MariKeyPair[]>([]);
  const [contractId, setContractId] = useState("");
  const [attachments, setAttachments] = useState<MailAttachRow[]>([]);
  const [selectedAttachIds, setSelectedAttachIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [stampWarning, setStampWarning] = useState<string | null>(null);
  const submittingRef = useRef(false);

  function applyBodyFromMail(source: MailTicketImportSource | null) {
    const next = initialMailTicketDescription({
      bodyHtml: source?.bodyHtml,
      bodyText: source?.bodyText,
      snippet: source?.snippet,
      contentType: source?.bodyContentType,
    });
    setBody(next.body);
    setIsHtml(next.isHtml);
    setRawHtml((source?.bodyHtml || "").trim());
    setHtmlSyncKey(`${Date.now()}-open`);
    if (next.isHtml && source?.bodyHtml) {
      setStrippedContentIds(
        stripOutlookSignatureImages(source.bodyHtml).removedContentIds
      );
    } else {
      setStrippedContentIds([]);
    }
  }

  function reapplySignatureStrip() {
    const source = (isHtml ? body || rawHtml : rawHtml || body).trim();
    if (!source) return;
    const stripped = stripOutlookSignatureImages(source);
    setBody(stripped.html.slice(0, MAIL_TICKET_HTML_MAX));
    setIsHtml(true);
    setHtmlSyncKey(`${Date.now()}-strip`);
    setStrippedContentIds(stripped.removedContentIds);
  }

  useEffect(() => {
    if (!open) return;
    const next = parseMailSender({
      from: mail?.from,
      fromName: mail?.fromName,
    });
    setContactName(next.name);
    setContactEmail(next.email);
    setSubject((mail?.subject || "").trim());
    applyBodyFromMail(mail);
    setSuggestions([]);
    setLookupState("idle");
    setCardCode("");
    setCustomerName("");
    setProjectQuery("");
    setProjects([]);
    setProjectNumber("");
    setProjectLabel("");
    setProjectOpen(false);
    setCompanyId(null);
    setContracts([]);
    setContractId("");
    setAttachments([]);
    setSelectedAttachIds([]);
    setBusy(false);
    setError(null);
    setCreatedId(null);
    setAttachNote(null);
    setStampWarning(null);
    submittingRef.current = false;
  }, [open, mail?.from, mail?.fromName, mail?.subject, mail?.bodyHtml, mail?.bodyText, mail?.snippet, mail?.bodyContentType]);

  useEffect(() => {
    if (!open || !mail?.messageId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/microsoft/mail/${encodeURIComponent(mail.messageId!)}/attachments?all=1`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const strippedIds = mail.bodyHtml
          ? stripOutlookSignatureImages(mail.bodyHtml).removedContentIds
          : [];
        const next = ((data.attachments || []) as MailAttachRow[]).filter(
          (a) => {
            const cid = (a.contentId || "").toLowerCase();
            if (!cid || strippedIds.length === 0) return true;
            return !strippedIds.some(
              (c) => cid === c.toLowerCase() || cid.includes(c.toLowerCase())
            );
          }
        );
        setAttachments(next);
        setSelectedAttachIds(next.map((a) => a.id));
      } catch {
        if (!cancelled) {
          setAttachments([]);
          setSelectedAttachIds([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mail?.messageId]);

  useEffect(() => {
    if (!open) return;
    const email = contactEmail.trim();
    if (!email.includes("@")) {
      setLookupState("empty");
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLookupState("loading");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/maringo/customers?email=${encodeURIComponent(email)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            throw new Error(data.error || t("mail.senderSearchFailed"));
          }
          const next = (data.suggestions || []) as MariEmailPartnerSuggestion[];
          setSuggestions(next);
          setLookupState(next.length > 0 ? "done" : "empty");
          if (next.length === 1 && !cardCode && !projectNumber) {
            applySuggestion(next[0]!);
          }
        } catch {
          if (!cancelled) {
            setLookupState("empty");
            setSuggestions([]);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactEmail]);

  useEffect(() => {
    if (!open || !projectOpen) return;
    let cancelled = false;
    const q = projectQuery.trim();
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoadingProjects(true);
        try {
          const res = await fetch(
            `/api/maringo/timekeeping/projects${
              q ? `?q=${encodeURIComponent(q)}` : ""
            }`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            throw new Error(data.error || t("mail.loadProjectsFailed"));
          }
          setProjects((data.projects || []) as MariKeyPair[]);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        } finally {
          if (!cancelled) setLoadingProjects(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, projectOpen, projectQuery]);

  useEffect(() => {
    if (!open || !projectNumber) {
      setContracts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [contractRes, customerRes] = await Promise.all([
          fetch(
            `/api/maringo/timekeeping/projects/${encodeURIComponent(
              projectNumber
            )}/contracts`
          ),
          fetch(
            `/api/maringo/customers?projectNumber=${encodeURIComponent(
              projectNumber
            )}`
          ),
        ]);
        const contractData = await contractRes.json().catch(() => ({}));
        const customerData = await customerRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!contractRes.ok) {
          throw new Error(
            contractData.error || t("mail.loadContractsFailed")
          );
        }
        const nextContracts = (contractData.contracts || []) as MariKeyPair[];
        setContracts(nextContracts);
        if (nextContracts.length === 1) {
          setContractId(nextContracts[0]!.keyInternal);
        }
        const customers = (customerData.customers || []) as Array<{
          cardCode: string;
          name: string;
        }>;
        const customer = customers[0];
        if (customer) {
          setCardCode(customer.cardCode);
          setCustomerName(customer.name);
        }
        const fromProject = parseMariCompanyId(customerData.company);
        if (fromProject != null) {
          setCompanyId(fromProject);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectNumber]);

  function applySuggestion(s: MariEmailPartnerSuggestion) {
    setCardCode(s.cardCode);
    setCustomerName(s.name);
    if (s.contactName && !contactName.trim()) {
      setContactName(s.contactName);
    }
    if (s.projectNumber) {
      setProjectNumber(s.projectNumber);
      setProjectLabel(
        formatMariProjectLabel(s.projectNumber, s.projectLabel)
      );
      setProjectOpen(false);
      setContractId(
        s.contractId != null && s.contractId > 0 ? String(s.contractId) : ""
      );
    }
  }

  function selectProject(p: MariKeyPair) {
    const visible = (p.keyVisible || "").trim();
    const internal = (p.keyInternal || "").trim();
    const pn = looksLikeMariProjectNumber(visible)
      ? visible
      : looksLikeMariProjectNumber(internal)
        ? internal
        : visible || internal;
    setProjectNumber(pn);
    setProjectLabel(formatMariProjectLabel(pn, p.matchcode));
    setProjectOpen(false);
    setContractId("");
    setCardCode("");
    setCustomerName("");
    const fromList = parseMariCompanyId(p.company);
    if (fromList != null) setCompanyId(fromList);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current || busy) return;
    setError(null);
    const email = contactEmail.trim();
    if (!email.includes("@")) {
      setError(t("mail.emailRequired"));
      return;
    }
    const pn = sanitizeMariProjectNumber(projectNumber);
    if (!pn) {
      setError(
        t("mail.projectRequired")
      );
      return;
    }
    const company = parseMariCompanyId(companyId);
    if (company == null) {
      setError(
        t("mail.tenantMissing")
      );
      return;
    }
    if (contracts.length > 0 && !contractId) {
      setError(t("mail.contractRequired"));
      return;
    }
    const act = subject.trim();
    if (!act) {
      setError(t("mail.subjectMissing"));
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/maringo/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefDescription: act,
          requestText: body.trim(),
          requestIsHtml: isHtml,
          contactName: contactName.trim() || null,
          contactEmail: email,
          cardCode: cardCode.trim() || null,
          projectNumber: pn,
          company,
          contractId: contractId ? Number(contractId) || null : null,
          microsoftMessageId: mail?.messageId || null,
          attachmentIds: selectedAttachIds,
          strippedContentIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || t("mail.createTicketFailed")
        );
      }
      const issueId = Number(
        (data as { issueId?: number; ticket?: { issueId?: number } }).issueId ||
          (data as { ticket?: { issueId?: number } }).ticket?.issueId
      );
      if (!Number.isInteger(issueId) || issueId <= 0) {
        throw new Error(t("mail.noTicketId"));
      }
      const attach = (
        data as {
          mailAttachments?: {
            attached?: Array<{ name: string }>;
            errors?: string[];
          };
          mailStamp?: { ok?: boolean; category?: string | null; error?: string | null };
        }
      ).mailAttachments;
      const stamp = (
        data as {
          mailStamp?: { ok?: boolean; category?: string | null; error?: string | null };
        }
      ).mailStamp;
      const notes: string[] = [];
      const side: string[] = [];
      const attachedN = attach?.attached?.length || 0;
      const attachErr = (attach?.errors || []).filter(Boolean);
      if (attachErr.length > 0) {
        side.push(
          attachedN > 0
            ? t("mail.attachmentsApplied", {
                count: attachedN,
                errors: attachErr.join(" · "),
              })
            : attachErr.join(" · ")
        );
      } else if (attachedN > 0) {
        notes.push(t("mail.attachmentsOnTicket", { count: attachedN }));
      }
      if (stamp?.ok) {
        notes.push(
          t("mail.outlookStamped", {
            category: stamp.category || t("mail.importAsTicket"),
          })
        );
      } else if (stamp?.error) {
        side.push(
          t("mail.outlookStampFailed", { error: stamp.error })
        );
      }
      if (notes.length > 0) setAttachNote(notes.join(" "));
      if (side.length > 0) setStampWarning(side.join(" "));
      setCreatedId(issueId);
      showActionFeedback({
        headline: t("mail.ticketCreatedToast", { id: issueId }),
        detail: act,
        tone: "success",
      });
    } catch (err) {
      submittingRef.current = false;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const customerLine = customerName
    ? `${customerName}${cardCode ? ` (${cardCode})` : ""}`
    : cardCode;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="z-[1200] flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base leading-snug">
            {createdId
              ? t("mail.ticketCreated", { id: createdId })
              : t("mail.createTicket")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {createdId
              ? t("mail.ticketCreatedHint")
              : t("mail.ticketFormHint")}
          </DialogDescription>
        </DialogHeader>

        {createdId ? (
          <div className="space-y-4 px-4 py-5" role="status">
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {t("mail.ticketNumber", { id: createdId })}
            </p>
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-snug text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100">
              {t("mail.ticketCreated", { id: createdId })}
            </p>
            {attachNote ? (
              <p className="text-xs text-muted-foreground">{attachNote}</p>
            ) : null}
            {stampWarning ? (
              <p
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/12 dark:text-amber-100"
              >
                {stampWarning}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={`/maringo?open=${createdId}`}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "min-h-11 gap-1.5"
                )}
              >
                <Ticket className="size-4" strokeWidth={APP_ICON_STROKE} />
                {t("mail.openTicketInMaringo")}
              </a>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => onOpenChange(false)}
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3"
          >
            {error ? (
              <p
                role="alert"
                className="whitespace-pre-wrap break-words rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100"
              >
                {error}
              </p>
            ) : null}

            <FieldGroup
              title={t("mail.contact")}
              required
              hint={t("mail.contactHint")}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="mail-tk-contact">{t("common.name")}</Label>
                  <Input
                    id="mail-tk-contact"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder={t("mail.contactNamePlaceholder")}
                    maxLength={200}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mail-tk-email">
                    {t("common.email")}
                    <RequiredMark />
                  </Label>
                  <Input
                    id="mail-tk-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={t("microsoft.toPlaceholder")}
                    maxLength={120}
                    autoComplete="off"
                    required
                  />
                </div>
              </div>
              {lookupState === "loading" ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {t("mail.searchingPartner")}
                </p>
              ) : null}
              {lookupState === "empty" && contactEmail.includes("@") ? (
                <p className="text-xs text-muted-foreground">
                  {t("mail.noPartnerHit")}
                </p>
              ) : null}
              {suggestions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("mail.suggestions")}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {suggestions.map((s) => {
                      const active =
                        s.cardCode === cardCode &&
                        (s.projectNumber || "") === projectNumber;
                      const label = s.projectNumber
                        ? `${s.name} · ${s.projectNumber}`
                        : s.name;
                      return (
                        <li
                          key={`${s.cardCode}-${s.projectNumber || "none"}-${s.source}`}
                        >
                          <Button
                            type="button"
                            variant={active ? "secondary" : "outline"}
                            className="h-auto min-h-11 w-full items-start justify-start whitespace-normal px-2.5 py-1.5 text-left text-sm"
                            onClick={() => applySuggestion(s)}
                          >
                            <span className="min-w-0">
                              <span className="block break-words font-medium leading-snug">
                                {label}
                              </span>
                              {s.contactName ? (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {s.contactName}
                                </span>
                              ) : null}
                            </span>
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </FieldGroup>

            <FieldGroup
              title={t("common.project")}
              required
              hint={t("mail.projectHint")}
            >
              <div className="space-y-1">
                <Label htmlFor="mail-tk-project">
                  {t("common.project")}
                  <RequiredMark />
                </Label>
                <div className="relative">
                  <Input
                    id="mail-tk-project"
                    value={
                      projectOpen ? projectQuery : projectLabel || projectQuery
                    }
                    onChange={(e) => {
                      setProjectQuery(e.target.value);
                      setProjectOpen(true);
                    }}
                    onFocus={() => {
                      setProjectOpen(true);
                      setProjectQuery("");
                    }}
                    placeholder={t("mail.searchProject")}
                    autoComplete="off"
                    required={!projectNumber}
                  />
                  {projectOpen ? (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
                      {loadingProjects ? (
                        <p className="px-2.5 py-2 text-xs text-muted-foreground">
                          {t("common.loading")}
                        </p>
                      ) : projects.length === 0 ? (
                        <p className="px-2.5 py-2 text-xs text-muted-foreground">
                          {t("common.noResults")}
                        </p>
                      ) : (
                        <ul>
                          {projects.slice(0, 80).map((p) => (
                            <li key={`${p.keyInternal}-${p.matchcode}`}>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-auto w-full flex-col items-start justify-start px-2.5 py-1.5 text-left text-xs font-normal hover:bg-muted"
                                onClick={() => selectProject(p)}
                              >
                                <span className="font-medium">
                                  {p.matchcode}
                                </span>
                                <span className="text-muted-foreground">
                                  {p.keyVisible || p.keyInternal}
                                </span>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              <p
                className="text-sm leading-snug text-muted-foreground"
                aria-live="polite"
              >
                <span className="font-medium text-foreground">{t("workspace.customer")}</span>
                {customerLine ? (
                  <> · {customerLine}</>
                ) : (
                  <> · {t("mail.followsFromProject")}</>
                )}
              </p>
              <MariKeyPairPicker
                id="mail-tk-contract"
                label={
                  contracts.length > 0
                    ? t("mail.contractStar")
                    : t("mail.contract")
                }
                value={contractId}
                options={contracts}
                placeholder={t("mail.chooseContract")}
                emptyLabel={t("mail.noContractNeeded")}
                disabled={!projectNumber}
                onChange={setContractId}
              />
            </FieldGroup>

            <FieldGroup title={t("mail.subject")} required>
              <div className="space-y-1">
                <Label htmlFor="mail-tk-subject" className="sr-only">
                  {t("mail.subject")}
                  <RequiredMark />
                </Label>
                <Input
                  id="mail-tk-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={250}
                  required
                />
              </div>
            </FieldGroup>

            <FieldGroup
              title={t("mail.mailText")}
              hint={
                isHtml
                  ? t("mail.htmlPreview")
                  : t("mail.plainEditable")
              }
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="mail-tk-body" id="mail-tk-body-label">
                    {isHtml ? t("mail.htmlDescription") : t("common.description")}
                  </Label>
                  {isHtml ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 min-h-9 text-xs"
                      onClick={() => reapplySignatureStrip()}
                    >
                      {t("mail.removeSignatureImages")}
                    </Button>
                  ) : null}
                </div>
                {isHtml ? (
                  <MailHtmlImportEditor
                    html={body}
                    syncKey={htmlSyncKey}
                    labelledBy="mail-tk-body-label"
                    onChange={setBody}
                  />
                ) : (
                  <Textarea
                    id="mail-tk-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={8000}
                    className="min-h-36 text-sm"
                  />
                )}
              </div>
            </FieldGroup>

            <FieldGroup
              title={t("mail.attachments")}
              hint={
                attachments.length > 0
                  ? t("mail.attachmentsPicked")
                  : t("mail.noFileAttachments")
              }
            >
              {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("mail.noAttachments")}</p>
              ) : (
                <ul className="space-y-1">
                  {attachments.map((a) => {
                    const checked = selectedAttachIds.includes(a.id);
                    return (
                      <li key={a.id}>
                        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl bg-muted px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 size-4"
                            checked={checked}
                            onChange={() => {
                              setSelectedAttachIds((prev) =>
                                prev.includes(a.id)
                                  ? prev.filter((id) => id !== a.id)
                                  : [...prev, a.id]
                              );
                            }}
                          />
                          <span className="min-w-0 flex-1 break-words leading-snug">
                            <span className="font-medium">{a.name}</span>
                            {formatBytes(a.size) ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {formatBytes(a.size)}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FieldGroup>

            <Button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="min-h-11 w-full sm:w-auto"
            >
              {busy ? t("mail.creatingTicket") : t("mail.createTicketInMaringo")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
