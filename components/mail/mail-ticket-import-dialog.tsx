"use client";

import { useEffect, useState, type FormEvent } from "react";
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
import { MariKeyPairPicker } from "@/components/maringo/mari-key-pair-picker";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { excerptMailBody, parseMailSender } from "@/lib/mail/mail-contact";
import type {
  MariCustomerOption,
  MariEmailPartnerSuggestion,
} from "@/lib/mari/customers";
import type { MariKeyPair } from "@/lib/mari/timekeeping-shared";
import {
  formatMariProjectLabel,
  looksLikeMariProjectNumber,
  sanitizeMariProjectNumber,
} from "@/lib/mari/timekeeping-shared";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { cn } from "@/lib/utils";

export type MailTicketImportSource = {
  from?: string | null;
  fromName?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  snippet?: string | null;
};

export function MailTicketImportDialog({
  open,
  onOpenChange,
  mail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mail: MailTicketImportSource | null;
}) {
  const sender = parseMailSender({
    from: mail?.from,
    fromName: mail?.fromName,
  });
  const [contactName, setContactName] = useState(sender.name);
  const [contactEmail, setContactEmail] = useState(sender.email);
  const [subject, setSubject] = useState((mail?.subject || "").trim());
  const [body, setBody] = useState(
    excerptMailBody(mail?.bodyText, mail?.snippet)
  );
  const [suggestions, setSuggestions] = useState<MariEmailPartnerSuggestion[]>(
    []
  );
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "done" | "empty"
  >("idle");
  const [cardCode, setCardCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerChoices, setCustomerChoices] = useState<MariCustomerOption[]>(
    []
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<MariKeyPair[]>([]);
  const [projectNumber, setProjectNumber] = useState("");
  const [projectLabel, setProjectLabel] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [contracts, setContracts] = useState<MariKeyPair[]>([]);
  const [contractId, setContractId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = parseMailSender({
      from: mail?.from,
      fromName: mail?.fromName,
    });
    setContactName(next.name);
    setContactEmail(next.email);
    setSubject((mail?.subject || "").trim());
    setBody(excerptMailBody(mail?.bodyText, mail?.snippet));
    setSuggestions([]);
    setLookupState("idle");
    setCardCode("");
    setCustomerName("");
    setCustomerChoices([]);
    setProjectQuery("");
    setProjects([]);
    setProjectNumber("");
    setProjectLabel("");
    setProjectOpen(false);
    setContracts([]);
    setContractId("");
    setBusy(false);
    setError(null);
    setCreatedId(null);
  }, [open, mail?.from, mail?.fromName, mail?.subject, mail?.bodyText, mail?.snippet]);

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
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/maringo/customers?email=${encodeURIComponent(email)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            throw new Error(data.error || "Absender-Suche fehlgeschlagen");
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
      window.clearTimeout(t);
    };
    // applySuggestion is stable enough for this open-cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactEmail]);

  useEffect(() => {
    if (!open || !projectOpen) return;
    let cancelled = false;
    const q = projectQuery.trim();
    const t = window.setTimeout(() => {
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
            throw new Error(data.error || "Projekte laden fehlgeschlagen");
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
      window.clearTimeout(t);
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
            contractData.error || "Verträge laden fehlgeschlagen"
          );
        }
        setContracts((contractData.contracts || []) as MariKeyPair[]);
        const customers = (customerData.customers ||
          []) as MariCustomerOption[];
        if (customers.length === 1) {
          setCardCode(customers[0]!.cardCode);
          setCustomerName(customers[0]!.name);
          setCustomerChoices([]);
        } else if (customers.length > 1) {
          setCustomerChoices(customers);
          if (!customers.some((c) => c.cardCode === cardCode)) {
            setCardCode("");
            setCustomerName("");
          }
        } else if (!cardCode) {
          setCustomerChoices([]);
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
    // cardCode is only used to keep an existing pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectNumber]);

  function applySuggestion(s: MariEmailPartnerSuggestion) {
    setCardCode(s.cardCode);
    setCustomerName(s.name);
    setCustomerChoices([]);
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
    setCustomerChoices([]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const pn = sanitizeMariProjectNumber(projectNumber);
    if (!pn) {
      setError(
        "Projektnummer fehlt — bitte ein Projekt aus der Liste wählen."
      );
      return;
    }
    const act = subject.trim();
    if (!act) {
      setError("Betreff fehlt.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/maringo/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefDescription: act,
          requestText: body.trim(),
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          cardCode: cardCode.trim() || null,
          projectNumber: pn,
          contractId: contractId ? Number(contractId) || null : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || "Ticket anlegen fehlgeschlagen"
        );
      }
      const issueId = Number(
        (data as { ticket?: { issueId?: number } }).ticket?.issueId
      );
      if (!Number.isInteger(issueId) || issueId <= 0) {
        throw new Error("MARI hat keine Ticket-ID zurückgegeben.");
      }
      setCreatedId(issueId);
      showActionFeedback({
        headline: `Ticket #${issueId} angelegt`,
        detail: act,
        tone: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[1200] flex max-h-[90dvh] w-[min(96vw,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base leading-snug">
            Ticket aus Mail erstellen
          </DialogTitle>
          <DialogDescription className="text-xs">
            Vorschläge aus dem Absender sind nur vorausgefüllt — bitte prüfen
            und bestätigen. Es wird keine Extra-Mail an den Kunden gesendet.
          </DialogDescription>
        </DialogHeader>

        {createdId ? (
          <div className="space-y-3 px-4 py-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100">
              Ticket #{createdId} ist in Maringo angelegt.
            </p>
            <a
              href={`/maringo?open=${createdId}`}
              className={cn(
                buttonVariants({ variant: "default" }),
                "min-h-11 gap-1.5"
              )}
            >
              <Ticket className="size-4" strokeWidth={APP_ICON_STROKE} />
              Ticket #{createdId} in Maringo öffnen
            </a>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {error ? (
              <p
                role="alert"
                className="whitespace-pre-wrap break-words rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-950 dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-100"
              >
                {error}
              </p>
            ) : null}

            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/15 p-3">
              <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Ansprechpartner
              </p>
              <div className="space-y-1">
                <Label htmlFor="mail-tk-contact">Name</Label>
                <Input
                  id="mail-tk-contact"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="z.B. Frau Muster"
                  maxLength={200}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mail-tk-email">E-Mail</Label>
                <Input
                  id="mail-tk-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="name@firma.ch"
                  maxLength={120}
                  autoComplete="off"
                />
              </div>
            </div>

            {lookupState === "loading" ? (
              <p className="text-xs text-muted-foreground" role="status">
                Suche Geschäftspartner zur Absender-Adresse…
              </p>
            ) : null}
            {lookupState === "empty" && contactEmail.includes("@") ? (
              <p className="text-xs text-muted-foreground">
                Kein Treffer zur E-Mail — bitte ein Projekt suchen. Der Kunde
                folgt aus dem gewählten Projekt.
              </p>
            ) : null}
            {suggestions.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vorschläge — bitte wählen
                </p>
                <ul className="space-y-1.5">
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
                          className="h-auto min-h-11 w-full items-start justify-start whitespace-normal px-3 py-2 text-left text-sm"
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

            <div className="space-y-1">
              <Label htmlFor="mail-tk-customer">Kunde</Label>
              <Input
                id="mail-tk-customer"
                value={
                  customerName
                    ? `${customerName}${cardCode ? ` (${cardCode})` : ""}`
                    : cardCode
                }
                readOnly
                placeholder="Folgt aus dem Projekt"
                className="bg-muted"
              />
              {customerChoices.length > 1 ? (
                <ul className="mt-1 space-y-1">
                  {customerChoices.map((c) => (
                    <li key={c.cardCode}>
                      <Button
                        type="button"
                        variant={
                          c.cardCode === cardCode ? "secondary" : "outline"
                        }
                        className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2 text-left text-sm"
                        onClick={() => {
                          setCardCode(c.cardCode);
                          setCustomerName(c.name);
                        }}
                      >
                        {c.name} ({c.cardCode})
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="mail-tk-project">Projekt</Label>
              <div className="relative">
                <Input
                  id="mail-tk-project"
                  value={projectOpen ? projectQuery : projectLabel || projectQuery}
                  onChange={(e) => {
                    setProjectQuery(e.target.value);
                    setProjectOpen(true);
                  }}
                  onFocus={() => {
                    setProjectOpen(true);
                    setProjectQuery("");
                  }}
                  placeholder="Suche z.B. Werk oder P200000"
                  autoComplete="off"
                />
                {projectOpen ? (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
                    {loadingProjects ? (
                      <p className="px-2.5 py-2 text-xs text-muted-foreground">
                        Lade…
                      </p>
                    ) : projects.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs text-muted-foreground">
                        Keine Treffer
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
                              <span className="font-medium">{p.matchcode}</span>
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

            <MariKeyPairPicker
              id="mail-tk-contract"
              label="Vertrag"
              value={contractId}
              options={contracts}
              placeholder="Vertrag wählen…"
              emptyLabel="Kein Vertrag nötig"
              disabled={!projectNumber}
              onChange={setContractId}
            />

            <div className="space-y-1">
              <Label htmlFor="mail-tk-subject">Betreff</Label>
              <Input
                id="mail-tk-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={250}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mail-tk-body">Beschreibung</Label>
              <Textarea
                id="mail-tk-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={8000}
                className="min-h-28 text-sm"
              />
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full sm:w-auto"
            >
              {busy ? "Lege Ticket an…" : "Ticket in Maringo anlegen"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
