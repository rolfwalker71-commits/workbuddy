/** Step model for the floating Tagesabschluss-Assistent. */

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
  opts?: { includeMariHours?: boolean }
): CloseoutStepDef[] {
  const base = provider === "google" ? "/google" : "/microsoft";
  const label = provider === "google" ? "Gmail" : "Outlook";
  const steps: CloseoutStepDef[] = [
    {
      id: "calendar",
      title: "Offene Termine prüfen",
      hint: "Jeden Termin erledigen oder auf einen freien Slot verschieben.",
      href: `${base}?tab=calendar&review=1`,
      cta: "Termine prüfen",
      visualLabel: "Kalender",
    },
    {
      id: "day-analysis",
      title: `${label}-Tagesanalyse`,
      hint: "Posteingang analysieren und Vorschläge übernehmen.",
      href: `${base}?tab=mail&view=tagesanalysen`,
      cta: "Tagesanalyse öffnen",
      visualLabel: "Analyse",
    },
  ];
  if (opts?.includeMariHours) {
    steps.push({
      id: "ticket-hours",
      title: "Ticket-Stunden buchen",
      hint: "Gestempelte Ticket-Termine prüfen und buchen.",
      href: "/maringo?tab=hours",
      cta: "Zu Stunden-Vorschlägen",
      visualLabel: "Stunden",
    });
  }
  steps.push({
    id: "done",
    title: "Abschluss bestätigen",
    hint: "Alles erledigt — Ritual abschliessen.",
    href: "/",
    cta: "Zur Übersicht",
    visualLabel: "Fertig",
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
  status: CloseoutStatusPayload
): string {
  switch (stepId) {
    case "calendar":
      return status.ritual.calendarOpen > 0
        ? `${status.ritual.calendarOpen} offen`
        : "Keine offen";
    case "day-analysis": {
      const flag =
        provider === "google"
          ? status.ritual.googleDayDone
          : status.ritual.microsoftDayDone;
      if (flag === null) return "Nicht verbunden";
      return flag ? "Erledigt" : "Noch offen";
    }
    case "ticket-hours":
      return status.ticketHourSuggestions > 0
        ? `${status.ticketHourSuggestions} Vorschlag${
            status.ticketHourSuggestions === 1 ? "" : "e"
          }`
        : "Keine offen";
    case "done":
      return stepDone("done", provider, status) ? "Bereit" : "Noch offen";
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

export function microChecksFor(stepId: CloseoutStepId): string[] {
  switch (stepId) {
    case "calendar":
      return [
        "Offene Termine ansehen",
        "Erledigen / verschieben / bestätigen",
        "Count auf 0",
      ];
    case "day-analysis":
      return [
        "Analyse laufen lassen",
        "Vorschläge prüfen",
        "Erledigt markieren",
      ];
    case "ticket-hours":
      return [
        "Vorschlagsliste öffnen",
        "Stunden prüfen und buchen",
        "Rest verwerfen oder erledigen",
      ];
    case "done":
      return ["Alle Provider-Schritte grün", "Assistent schliessen"];
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
