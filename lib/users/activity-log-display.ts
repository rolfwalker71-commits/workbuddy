export const ACTIVITY_EVENT_VALUES = [
  "login",
  "logout",
  "session_expired",
  "ticket_analysis",
  "mail_day_analysis",
] as const;

export type ActivityEventValue = (typeof ACTIVITY_EVENT_VALUES)[number];

export const ACTIVITY_EVENT_LABELS: Record<ActivityEventValue, string> = {
  login: "Anmeldung",
  logout: "Abmeldung",
  session_expired: "Session abgelaufen",
  ticket_analysis: "Ticketanalyse",
  mail_day_analysis: "AI-Tagesanalyse",
};

export type ActivityDetailRecord = Record<string, unknown> | null;

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return null;
}

function shortSwiss(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.`;
}

function providerLabel(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (
    key === "outlook" ||
    key === "microsoft" ||
    key === "ms" ||
    key === "m365"
  ) {
    return "Outlook";
  }
  if (key === "gmail" || key === "google") return "Gmail";
  return raw;
}

function isFailed(detail: Record<string, unknown>): boolean {
  if (detail.ok === false) return true;
  if (typeof detail.error === "string" && detail.error.trim()) return true;
  return false;
}

/** Kurzdetail: `Ticket #144647` or `28.08.–29.08. · Outlook`. */
export function formatActivityDetail(input: {
  event: string;
  detail: ActivityDetailRecord;
}): string {
  const detail = input.detail;
  if (!detail) return "—";

  if (input.event === "ticket_analysis") {
    const id =
      asString(detail.issueId) ||
      asString(detail.ticketId) ||
      asString(detail.id);
    if (!id) return isFailed(detail) ? "fehlgeschlagen" : "—";
    return isFailed(detail) ? `Ticket #${id} · fehlgeschlagen` : `Ticket #${id}`;
  }

  if (input.event === "mail_day_analysis") {
    const from = asString(detail.fromYmd) || asString(detail.from);
    const to = asString(detail.toYmd) || asString(detail.to) || from;
    const provider = providerLabel(asString(detail.provider));
    let range = "";
    if (from && to && from !== to) {
      range = `${shortSwiss(from)}–${shortSwiss(to)}`;
    } else if (from) {
      range = shortSwiss(from);
    }
    const parts = [
      range || null,
      provider,
      isFailed(detail) ? "fehlgeschlagen" : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }

  return "—";
}

export function activityEventLabel(event: string): string {
  if (event in ACTIVITY_EVENT_LABELS) {
    return ACTIVITY_EVENT_LABELS[event as ActivityEventValue];
  }
  return event;
}
