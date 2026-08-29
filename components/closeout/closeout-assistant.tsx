"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { GoogleLogo, MicrosoftLogo } from "@/components/branding/provider-logos";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  closeoutLeadHref,
  closeoutStepsFor,
  firstOpenStepIndex,
  microChecksFor,
  pathMatchesStep,
  stepDetail,
  stepDone,
  type CloseoutProvider,
  type CloseoutStatusPayload,
  type CloseoutStepId,
} from "@/lib/closeout/steps";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

function closeoutStepText(
  t: (key: MessageKey, params?: Record<string, string | number | null | undefined>) => string,
  stepId: CloseoutStepId,
  provider: CloseoutProvider
) {
  const label = provider === "google" ? "Gmail" : "Outlook";
  switch (stepId) {
    case "calendar":
      return {
        title: t("closeout.checkOpenEvents"),
        hint: t("closeout.checkOpenEventsHint"),
        cta: t("closeout.checkEventsCta"),
      };
    case "day-analysis":
      return {
        title: t("closeout.dayAnalysis", { label }),
        hint: t("closeout.dayAnalysisHint"),
        cta: t("closeout.dayAnalysisCta"),
      };
    case "ticket-hours":
      return {
        title: t("closeout.bookTicketHours"),
        hint: t("closeout.bookTicketHoursHint"),
        cta: t("closeout.bookTicketHoursCta"),
      };
    default:
      return {
        title: t("closeout.confirmDone"),
        hint: t("closeout.confirmDoneHint"),
        cta: t("closeout.toOverview"),
      };
  }
}

export const CLOSEOUT_OPEN_EVENT = "buddy:closeout-open";

const STORAGE_KEY = "buddy.closeout.assistant.v1";
const POLL_MS = 20_000;

type StoredState = {
  open: boolean;
  minimized: boolean;
  provider: CloseoutProvider;
  dismissedDate: string | null;
  stepIndex: number;
  autoAdvance: boolean;
  skipped: CloseoutStepId[];
};

const DEFAULT_STORED: StoredState = {
  open: false,
  minimized: false,
  provider: "microsoft",
  dismissedDate: null,
  stepIndex: 0,
  autoAdvance: true,
  skipped: [],
};

function readStored(): StoredState {
  if (typeof window === "undefined") return DEFAULT_STORED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORED;
    return { ...DEFAULT_STORED, ...(JSON.parse(raw) as Partial<StoredState>) };
  } catch {
    return DEFAULT_STORED;
  }
}

function writeStored(next: StoredState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function userHasCalendarModule(modules: string[] | undefined, isAdmin: boolean) {
  if (isAdmin) return true;
  return (
    Boolean(modules?.includes("microsoft")) ||
    Boolean(modules?.includes("google"))
  );
}

function StepVisual({
  stepId,
  provider,
  here,
  done,
}: {
  stepId: CloseoutStepId;
  provider: CloseoutProvider;
  here: boolean;
  done: boolean;
}) {
  const Icon =
    stepId === "calendar"
      ? CalendarDays
      : stepId === "day-analysis"
        ? Sparkles
        : stepId === "ticket-hours"
          ? ClipboardList
          : Check;
  const t = useT();
  const { locale } = useLocale();
  const micros = microChecksFor(stepId, locale);
  return (
    <div className="space-y-2 rounded-2xl bg-muted px-3 py-2.5 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm ring-1 ring-foreground/10">
          {stepId === "day-analysis" && provider === "google" ? (
            <GoogleLogo className="size-5" />
          ) : stepId === "day-analysis" && provider === "microsoft" ? (
            <MicrosoftLogo className="size-5" />
          ) : (
            <Icon
              className="size-5 text-orange-700"
              strokeWidth={APP_ICON_STROKE}
              absoluteStrokeWidth
              aria-hidden
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("closeout.guide")}
            </p>
            {here ? (
              <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-teal-800">
                {t("closeout.youAreHere")}
              </span>
            ) : null}
            {done ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-emerald-800">
                {t("closeout.completed")}
              </span>
            ) : (
              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-orange-800">
                {t("closeout.stillOpen")}
              </span>
            )}
          </div>
          <p className="text-[0.8125rem] font-semibold leading-snug text-foreground">
            {stepId === "calendar"
              ? t("closeout.leadCalendar")
              : stepId === "day-analysis"
                ? t("closeout.leadAnalysis")
                : stepId === "ticket-hours"
                  ? t("closeout.leadHours")
                  : t("closeout.goodEvening")}
          </p>
        </div>
      </div>
      {micros.length ? (
        <ul className="space-y-1 border-t border-border/40 pt-2">
          {micros.map((label, i) => (
            <li
              key={label}
              className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground"
            >
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border"
                )}
              >
                {done ? <Check className="size-2.5" aria-hidden /> : null}
              </span>
              <span className={done ? "text-emerald-800 line-through" : ""}>
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const FLOAT_POS =
  "right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] md:right-6 md:bottom-6";

export function CloseoutAssistant() {
  const t = useT();
  const { locale } = useLocale();
  const { me, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [stored, setStored] = useState<StoredState>(DEFAULT_STORED);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<CloseoutStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadPending, setLeadPending] = useState(false);

  const modules = me?.modules || [];
  const hasCalendar = userHasCalendarModule(modules, Boolean(me?.isAdmin));
  const hasGoogle = Boolean(me?.isAdmin || modules.includes("google"));
  const hasMicrosoft = Boolean(me?.isAdmin || modules.includes("microsoft"));

  useEffect(() => {
    const s = readStored();
    setStored(s);
    setHydrated(true);
  }, []);

  useEffect(() => {
    function onOpen() {
      const s = readStored();
      const next = {
        ...s,
        open: true,
        minimized: false,
        dismissedDate: null,
      };
      writeStored(next);
      setStored(next);
      setLeadPending(true);
    }
    window.addEventListener(CLOSEOUT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CLOSEOUT_OPEN_EVENT, onOpen);
  }, []);

  const persist = useCallback((patch: Partial<StoredState>) => {
    setStored((prev) => {
      const next = { ...prev, ...patch };
      writeStored(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/day-close");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("closeout.loadFailed"));
      setStatus(data as CloseoutStatusPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !me || !hasCalendar) return;
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [hydrated, me, hasCalendar, load]);

  useEffect(() => {
    if (!hydrated || !status || !me) return;
    if (!status.weekday) return;
    if (stored.dismissedDate === status.todayIso) return;
    if (stored.open) return;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
    const start = status.startHm || "18:30";
    const [sh, sm] = start.split(":").map((n) => Number(n));
    const startMins = (sh || 18) * 60 + (sm || 0);
    if (hour * 60 + minute >= startMins) {
      persist({ open: true, minimized: false });
    }
  }, [hydrated, status, me, stored.dismissedDate, stored.open, persist]);

  const provider = stored.provider;
  const steps = useMemo(
    () =>
      closeoutStepsFor(provider, {
        includeMariHours: status?.maringoModule ?? false,
        locale,
      }),
    [provider, status?.maringoModule, locale]
  );

  useEffect(() => {
    if (!status || !hydrated) return;
    if (status.microsoftConnected && !status.googleConnected) {
      if (provider !== "microsoft") persist({ provider: "microsoft" });
    } else if (status.googleConnected && !status.microsoftConnected) {
      if (provider !== "google") persist({ provider: "google" });
    } else if (hasGoogle && !hasMicrosoft && provider !== "google") {
      persist({ provider: "google" });
    }
  }, [status, hydrated, provider, persist, hasGoogle, hasMicrosoft]);

  const activeIndex = Math.min(Math.max(0, stored.stepIndex), steps.length - 1);
  const active = steps[activeIndex];
  const search = typeof window !== "undefined" ? window.location.search : "";
  const here = active
    ? pathMatchesStep(pathname || "/", search, active)
    : false;

  function leadToStep(idx: number, opts?: { minimize?: boolean }) {
    const step = steps[idx];
    persist({
      stepIndex: idx,
      ...(opts?.minimize === false ? {} : { minimized: true }),
    });
    if (step) router.push(closeoutLeadHref(step));
  }

  function isStepComplete(stepId: CloseoutStepId): boolean {
    if (!status) return false;
    if (stored.skipped.includes(stepId) && stepId !== "done") return true;
    return stepDone(stepId, provider, status);
  }

  useEffect(() => {
    if (!leadPending || !status || !hydrated) return;
    const idx = firstOpenStepIndex(provider, status);
    leadToStep(idx);
    setLeadPending(false);
    // leadToStep is recreated each render — only react to the pending flag + status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadPending, status, hydrated, provider]);

  useEffect(() => {
    if (!status || !stored.autoAdvance || !stored.open || stored.minimized) {
      return;
    }
    if (isStepComplete(active.id) && active.id !== "done") {
      const next = steps.findIndex(
        (s) => s.id === "done" || !isStepComplete(s.id)
      );
      const idx = next < 0 ? steps.length - 1 : next;
      if (idx !== activeIndex) leadToStep(idx, { minimize: false });
    }
    // status ticks drive auto-advance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    status,
    stored.autoAdvance,
    stored.open,
    stored.minimized,
    stored.skipped,
    active.id,
    activeIndex,
    provider,
    persist,
  ]);

  const remaining = status
    ? steps.filter((s) => s.id !== "done" && !isStepComplete(s.id)).length
    : 0;
  const progressDone = steps.filter((s) => isStepComplete(s.id)).length;
  const allClear = status != null && remaining === 0;
  const showGoogleToggle =
    hasGoogle && (status == null || status.googleConnected !== false);
  const showMicrosoftToggle =
    hasMicrosoft && (status == null || status.microsoftConnected !== false);
  const showProviderSwitch = showGoogleToggle && showMicrosoftToggle;

  if (loading || !hydrated || !me || !hasCalendar) return null;
  if (pathname === "/login") return null;

  if (!stored.open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          persist({ open: true, minimized: false });
          setLeadPending(true);
        }}
        className={cn(
          "fixed z-40 h-auto min-h-11 gap-2 rounded-2xl border-border/70 bg-card px-3 py-2 text-xs font-semibold shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-foreground/10 hover:bg-muted",
          FLOAT_POS
        )}
        title={t("closeout.assistant")}
      >
        <Sparkles
          className="size-3.5 text-orange-600"
          strokeWidth={APP_ICON_STROKE}
          absoluteStrokeWidth
          aria-hidden
        />
        {t("closeout.shortTitle")}
        {remaining > 0 ? (
          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[0.625rem] text-white">
            {remaining}
          </span>
        ) : null}
      </Button>
    );
  }

  if (stored.minimized) {
    return (
      <Button
        type="button"
        variant="default"
        onClick={() => persist({ minimized: false })}
        className={cn(
          "fixed z-40 h-auto min-h-11 gap-2 rounded-2xl border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_28px_rgba(15,23,42,0.22)] hover:bg-slate-800/90",
          FLOAT_POS
        )}
      >
        {provider === "google" ? (
          <GoogleLogo className="size-3.5" />
        ) : (
          <MicrosoftLogo className="size-3.5" />
        )}
        {provider === "google" ? "Google" : "Outlook"} · {activeIndex + 1}/
        {steps.length}
        {remaining > 0 ? (
          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[0.625rem]">
            {remaining}
          </span>
        ) : (
          <Check className="size-3.5 text-emerald-300" aria-hidden />
        )}
        <ChevronUp className="size-3.5 opacity-80" aria-hidden />
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "fixed z-40 flex w-[min(calc(100vw-1.5rem),22rem)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_16px_48px_rgba(15,23,42,0.18)]",
        FLOAT_POS
      )}
      role="dialog"
      aria-label={t("closeout.assistant")}
    >
      <div className="flex items-center gap-2 bg-slate-800 px-3 py-2.5 text-white">
        <Sparkles className="size-4 text-orange-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[0.8125rem] font-bold leading-snug tracking-tight">
            {t("closeout.headingWithProvider", {
              provider: provider === "google" ? "Google" : "Outlook",
            })}
          </p>
          <p className="text-[0.625rem] text-white/70">
            {t("closeout.stepOf", {
              current: activeIndex + 1,
              total: steps.length,
            })}
            {busy ? ` · ${t("closeout.updating")}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-md text-white hover:bg-white/10"
          title={t("closeout.minimize")}
          onClick={() => persist({ minimized: true })}
        >
          <Minimize2 className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-md text-white hover:bg-white/10"
          title={t("common.close")}
          onClick={() =>
            persist({
              open: false,
              dismissedDate: status?.todayIso || stored.dismissedDate,
            })
          }
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      <div className="h-1.5 bg-muted">
        <div
          className="h-full bg-orange-500 transition-[width] duration-300"
          style={{
            width: `${Math.round((progressDone / Math.max(steps.length, 1)) * 100)}%`,
          }}
        />
      </div>

      {showProviderSwitch ? (
        <div className="flex gap-1 border-b border-border/50 bg-muted p-1.5">
          {(
            [
              {
                id: "google" as const,
                label: "Google",
                logo: <GoogleLogo className="size-3.5" />,
                enabled: showGoogleToggle,
              },
              {
                id: "microsoft" as const,
                label: "Outlook",
                logo: <MicrosoftLogo className="size-3.5" />,
                enabled: showMicrosoftToggle,
              },
            ] as const
          ).map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="ghost"
              size="sm"
              disabled={!p.enabled && p.id !== provider}
              onClick={() =>
                persist({
                  provider: p.id,
                  stepIndex: status ? firstOpenStepIndex(p.id, status) : 0,
                })
              }
              className={cn(
                "h-9 min-h-0 flex-1 rounded-full px-2 py-0 text-[0.6875rem] font-semibold",
                provider === p.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/60"
              )}
            >
              {p.logo}
              {p.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto p-3">
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {allClear ? (
          <div className="rounded-2xl bg-emerald-50 px-3 py-2.5 text-[0.8125rem] font-semibold text-emerald-900 ring-1 ring-emerald-200">
            {t("closeout.allDoneToday")}
          </div>
        ) : null}

        {active ? (
          <StepVisual
            stepId={active.id}
            provider={provider}
            here={here}
            done={isStepComplete(active.id)}
          />
        ) : null}

        <ul className="space-y-1.5">
          {steps.map((step, idx) => {
            const done = isStepComplete(step.id);
            const skipped = stored.skipped.includes(step.id);
            const current = idx === activeIndex;
            return (
              <li key={step.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto w-full whitespace-normal items-start justify-start gap-2.5 rounded-2xl border px-2.5 py-2 text-left",
                    current
                      ? "border-orange-300 bg-orange-50 hover:bg-orange-50"
                      : done
                        ? "border-emerald-200/70 bg-emerald-50/40 hover:bg-emerald-50/40"
                        : "border-border/50 bg-card hover:bg-muted"
                  )}
                  onClick={() => leadToStep(idx, { minimize: false })}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold",
                      done
                        ? "bg-emerald-500 text-white"
                        : current
                          ? "bg-orange-500 text-white"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="size-3" aria-hidden /> : idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="break-words text-[0.8125rem] font-semibold leading-snug tracking-tight">
                        {closeoutStepText(t, step.id, provider).title}
                      </span>
                      {status ? (
                        <span
                          className={cn(
                            "shrink-0 text-[0.625rem] font-semibold",
                            done ? "text-emerald-700" : "text-orange-700"
                          )}
                        >
                          {skipped
                            ? t("closeout.skipped")
                            : stepDetail(step.id, provider, status, locale)}
                        </span>
                      ) : null}
                    </span>
                    {current ? (
                      <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
                        {closeoutStepText(t, step.id, provider).hint}
                      </span>
                    ) : null}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>

        {active && active.id !== "done" ? (
          <div className="flex gap-2">
            <Button
              type="button"
              className="min-h-11 min-w-0 flex-1 gap-1.5 bg-orange-500 text-white hover:bg-orange-600"
              onClick={() => leadToStep(activeIndex)}
            >
              {closeoutStepText(t, active.id, provider).cta} →
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0"
              title={t("closeout.skipToday")}
              onClick={() => {
                const skipped = Array.from(
                  new Set([...stored.skipped, active.id])
                );
                const nextIdx = Math.min(activeIndex + 1, steps.length - 1);
                persist({ skipped });
                leadToStep(nextIdx, { minimize: false });
              }}
            >
              {t("common.skip")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border/50 bg-muted/20 px-3 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={activeIndex <= 0}
          onClick={() => leadToStep(Math.max(0, activeIndex - 1), { minimize: false })}
        >
          {t("common.back")}
        </Button>
        <label className="flex cursor-pointer items-center gap-1 text-[0.625rem] text-muted-foreground">
          <input
            type="checkbox"
            className="size-3 rounded border-border"
            checked={stored.autoAdvance}
            onChange={(e) => persist({ autoAdvance: e.target.checked })}
          />
          {t("common.auto")}
        </label>
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-[0.6875rem]"
          onClick={() =>
            persist({
              open: false,
              dismissedDate: status?.todayIso || null,
            })
          }
        >
          {t("closeout.later")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1 bg-orange-500 text-white hover:bg-orange-600"
          onClick={() => {
            if (activeIndex >= steps.length - 1 || allClear) {
              persist({
                open: false,
                dismissedDate: status?.todayIso || null,
                skipped: [],
              });
              return;
            }
            leadToStep(activeIndex + 1, { minimize: false });
          }}
        >
          {activeIndex >= steps.length - 1 || allClear
            ? t("common.done")
            : t("common.next")}
          <ChevronDown className="size-3.5 rotate-[-90deg]" aria-hidden />
        </Button>
      </div>

      <p className="bg-muted/30 px-3 pb-2 text-center text-[0.625rem] text-muted-foreground">
        {t("closeout.runsAlong")}{" "}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-[0.625rem] underline underline-offset-2"
          onClick={() => void load()}
        >
          {t("closeout.refresh")}
        </Button>
        {" · "}
        <Link href="/" className="underline underline-offset-2">
          {t("nav.overview")}
        </Link>
      </p>
    </div>
  );
}
