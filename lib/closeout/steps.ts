/** Step model for the floating Tagesabschluss-Assistent. */

import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

export type CloseoutProvider = "google" | "microsoft";

export type CloseoutStepId =
  | "calendar"
  | "day-analysis"
  | "ticket-hours"
  | "done";

export type CloseoutStepDef = {
  id: CloseoutStepId;
  title: string;
  hint: string;
  href: string;
  cta: string;
  visualLabel: string;
};

export type CloseoutStatusPayload = {
  todayIso: string;
  weekday: boolean;
  ritual: {
    calendarOpen: number;
    googleDayDone: boolean | null;
    microsoftDayDone: boolean | null;
    mariHoursPending: number | null;
  };
  ritualComplete: boolean;
  ticketHourSuggestions: number;
  googleConnected: boolean;
  microsoftConnected: boolean;
  maringoModule: boolean;
  /** User's virtual Tagesabschluss start (Europe/Zurich). */
  startHm?: string;
};

export function closeoutStepsFor(
  provider: CloseoutProvider,
  opts?: { includeMariHours?: boolean; locale?: Locale }
): CloseoutStepDef[] {
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const base = provider === "google" ? "/google" : "/microsoft";
  const label = provider === "google" ? "Gmail" : "Outlook";
  const steps: CloseoutStepDef[] = [
    {
      id: "calendar",
      title: translate(locale, "closeout.checkOpenEvents"),
      hint: translate(locale, "closeout.checkOpenEventsHint"),
      href: `${base}?tab=calendar&review=1`,
      cta: translate(locale, "closeout.checkEventsCta"),
      visualLabel: translate(locale, "closeout.calendar"),
    },
    {
      id: "day-analysis",
      title: translate(locale, "closeout.dayAnalysis", { label }),
      hint: translate(locale, "closeout.dayAnalysisHint"),
      href: `${base}?tab=mail&view=tagesanalysen`,
      cta: translate(locale, "closeout.dayAnalysisCta"),
      visualLabel: translate(locale, "closeout.analysis"),
    },
  ];
  if (opts?.includeMariHours) {
    steps.push({
      id: "ticket-hours",
      title: translate(locale, "closeout.bookTicketHours"),
      hint: translate(locale, "closeout.bookTicketHoursHint"),
      href: "/maringo?tab=hours",
      cta: translate(locale, "closeout.bookTicketHoursCta"),
      visualLabel: translate(locale, "closeout.hours"),
    });
  }
  steps.push({
    id: "done",
    title: translate(locale, "closeout.confirmDone"),
    hint: translate(locale, "closeout.confirmDoneHint"),
    href: "/",
    cta: translate(locale, "closeout.toOverview"),
    visualLabel: translate(locale, "common.done"),
  });
  return steps;
}

export function stepDone(
  stepId: CloseoutStepId,
  provider: CloseoutProvider,
  status: CloseoutStatusPayload
): boolean {
  switch (stepId) {
    case "calendar":
      return status.ritual.calendarOpen <= 0;
    case "day-analysis": {
      const flag =
        provider === "google"
          ? status.ritual.googleDayDone
          : status.ritual.microsoftDayDone;
      return flag !== false;
    }
    case "ticket-hours":
      if (!status.maringoModule) return true;
      return status.ticketHourSuggestions <= 0;
    case "done":
      return closeoutStepsFor(provider, {
        includeMariHours: status.maringoModule,
      })
        .filter((s) => s.id !== "done")
        .every((s) => stepDone(s.id, provider, status));
    default:
      return false;
  }
}

export function stepDetail(
  stepId: CloseoutStepId,
  provider: CloseoutProvider,
  status: CloseoutStatusPayload,
  locale: Locale = DEFAULT_LOCALE
): string {
  switch (stepId) {
    case "calendar":
      return status.ritual.calendarOpen > 0
        ? translate(locale, "common.openCount", {
            count: status.ritual.calendarOpen,
          })
        : translate(locale, "common.noneOpen");
    case "day-analysis": {
      const flag =
        provider === "google"
          ? status.ritual.googleDayDone
          : status.ritual.microsoftDayDone;
      if (flag === null) return translate(locale, "closeout.notConnected");
      return flag
        ? translate(locale, "closeout.completed")
        : translate(locale, "closeout.stillOpen");
    }
    case "ticket-hours":
      return status.ticketHourSuggestions > 0
        ? translate(
            locale,
            status.ticketHourSuggestions === 1
              ? "closeout.suggestion"
              : "closeout.suggestions",
            { count: status.ticketHourSuggestions }
          )
        : translate(locale, "common.noneOpen");
    case "done":
      return stepDone("done", provider, status)
        ? translate(locale, "closeout.ready")
        : translate(locale, "closeout.stillOpen");
    default:
      return "";
  }
}

export function firstOpenStepIndex(
  provider: CloseoutProvider,
  status: CloseoutStatusPayload
): number {
  const steps = closeoutStepsFor(provider, {
    includeMariHours: status.maringoModule,
  });
  const idx = steps.findIndex((s) => !stepDone(s.id, provider, status));
  return idx < 0 ? steps.length - 1 : idx;
}

export function openStepCount(
  provider: CloseoutProvider,
  status: CloseoutStatusPayload
): number {
  return closeoutStepsFor(provider, {
    includeMariHours: status.maringoModule,
  }).filter((s) => s.id !== "done" && !stepDone(s.id, provider, status)).length;
}

export function microChecksFor(
  stepId: CloseoutStepId,
  locale: Locale = DEFAULT_LOCALE
): string[] {
  switch (stepId) {
    case "calendar":
      return [
        translate(locale, "closeout.checkOpenEventsMicro"),
        translate(locale, "closeout.checkMoveConfirm"),
        translate(locale, "closeout.countToZero"),
      ];
    case "day-analysis":
      return [
        translate(locale, "closeout.runAnalysis"),
        translate(locale, "closeout.reviewSuggestions"),
        translate(locale, "closeout.markDone"),
      ];
    case "ticket-hours":
      return [
        translate(locale, "closeout.openSuggestionList"),
        translate(locale, "closeout.checkAndBookHours"),
        translate(locale, "closeout.discardOrFinish"),
      ];
    case "done":
      return [
        translate(locale, "closeout.allProviderGreen"),
        translate(locale, "closeout.closeAssistant"),
      ];
    default:
      return [];
  }
}

/** Deep link the assistant should open for a step (calendar enters review mode). */
export function closeoutLeadHref(step: CloseoutStepDef): string {
  if (step.id !== "calendar") return step.href;
  if (/(?:^|[?&])review=/.test(step.href)) return step.href;
  return `${step.href}${step.href.includes("?") ? "&" : "?"}review=1`;
}

export function pathMatchesStep(
  pathname: string,
  search: string,
  step: CloseoutStepDef
): boolean {
  try {
    const url = new URL(step.href, "https://workbuddy.local");
    if (pathname !== url.pathname) return false;
    const want = url.searchParams;
    const have = new URLSearchParams(
      search.startsWith("?") ? search : `?${search}`
    );
    for (const [k, v] of want.entries()) {
      if (k === "review") continue;
      if (have.get(k) !== v) return false;
    }
    return true;
  } catch {
    return pathname === step.href.split("?")[0];
  }
}
