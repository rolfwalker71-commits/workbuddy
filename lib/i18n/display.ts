import { DEFAULT_LOCALE, type Locale, parseLocale } from "./locales";
import { translate } from "./translate";
import type { MessageKey } from "./messages/types";
import { STATUS_LABELS } from "@/lib/mari/status";
import type { PresenceStatus } from "@/lib/presence/status";
import type { UserOrganization } from "@/lib/users/organization";
import type { NotifyReason } from "@/lib/realtime/hub";
import type { ActivityEventValue } from "@/lib/users/activity-log-display";
import type { TimeBucketId, TimeBucketPreset } from "@/lib/utils/time-buckets";
import type { IcsCalendarType } from "@/lib/calendar/ics-types";

const STATUS_MESSAGE: Record<number, MessageKey> = {
  11: "status.new",
  1: "status.open",
  3: "status.inProgress",
  13: "status.updated",
  6: "status.waitCustomer",
  9: "status.followCustomer",
  7: "status.waitVendor",
  10: "status.followVendor",
  4: "status.reopened",
  2: "status.resolved",
  12: "status.resolvedWaiting",
  8: "status.billed",
  5: "status.closed",
  14: "status.escalation",
  15: "status.onHold",
  16: "status.clarification",
};

const PRIORITY_MESSAGE: Record<number, MessageKey> = {
  1: "priority.1",
  2: "priority.2",
  3: "priority.3",
  4: "priority.4",
  5: "priority.5",
};

const PRESENCE_MESSAGE: Record<PresenceStatus, MessageKey> = {
  office: "presence.office",
  home: "presence.home",
  sick: "presence.sick",
  vacation: "presence.vacation",
  absent: "presence.absent",
};

const PRESENCE_PILL_MESSAGE: Record<PresenceStatus, MessageKey> = {
  office: "presence.office",
  home: "presence.home",
  sick: "presence.sick",
  vacation: "presence.vacation",
  absent: "presence.absent",
};

const ORG_MESSAGE: Record<UserOrganization, MessageKey> = {
  CH: "presence.orgCH",
  AT: "presence.orgAT",
  DE: "presence.orgDE",
  MX: "presence.orgMX",
};

const NOTIFY_MESSAGE: Record<NotifyReason, MessageKey> = {
  mari_ticket_changed: "notify.mariTicketChanged",
  mail_calendar_patch: "notify.mailCalendarPatch",
  microsoft_mail_day: "notify.microsoftMailDay",
  microsoft_teams_day: "notify.microsoftTeamsDay",
  google_mail_day: "notify.googleMailDay",
  evening_digest: "notify.eveningDigest",
  app_status: "notify.appStatus",
};

const ACTIVITY_MESSAGE: Record<ActivityEventValue, MessageKey> = {
  login: "activity.login",
  logout: "activity.logout",
  session_expired: "activity.sessionExpired",
  ticket_analysis: "activity.ticketAnalysis",
  mail_day_analysis: "activity.mailDayAnalysis",
};

const ICS_TYPE_MESSAGE: Record<IcsCalendarType, MessageKey> = {
  hockey: "calendar.types.hockey",
  school: "calendar.types.school",
  waste: "calendar.types.waste",
  church: "calendar.types.church",
  sports: "calendar.types.sports",
  family: "calendar.types.family",
  birthday: "calendar.types.birthday",
  work: "calendar.types.work",
  work_rolf: "calendar.types.workRolf",
  work_valentyna: "calendar.types.workValentyna",
  holiday: "calendar.types.holiday",
  private: "calendar.types.private",
  other: "calendar.types.other",
};

const BUCKET_MESSAGE: Record<TimeBucketId, MessageKey> = {
  overdue: "buckets.overdue",
  week: "buckets.week",
  twoWeeks: "buckets.twoWeeks",
  month: "buckets.month",
  halfYear: "buckets.halfYear",
  year: "buckets.year",
  later: "buckets.later",
  none: "buckets.none",
};

const WEATHER_CODE_MESSAGE: Record<number, MessageKey> = {
  0: "weather.code.0",
  1: "weather.code.1",
  2: "weather.code.2",
  3: "weather.code.3",
  45: "weather.code.45",
  48: "weather.code.48",
  51: "weather.code.51",
  53: "weather.code.53",
  55: "weather.code.55",
  56: "weather.code.56",
  57: "weather.code.57",
  61: "weather.code.61",
  63: "weather.code.63",
  65: "weather.code.65",
  66: "weather.code.66",
  67: "weather.code.67",
  71: "weather.code.71",
  73: "weather.code.73",
  75: "weather.code.75",
  77: "weather.code.77",
  80: "weather.code.80",
  81: "weather.code.81",
  82: "weather.code.82",
  85: "weather.code.85",
  86: "weather.code.86",
  95: "weather.code.95",
  96: "weather.code.96",
  99: "weather.code.99",
};

const WIND_KEYS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

/** Display only — matching against Maringo still uses STATUS_LABELS. */
export function statusDisplayLabel(
  statusId: number,
  locale: Locale | string | undefined = DEFAULT_LOCALE,
  fallback?: string
): string {
  const key = STATUS_MESSAGE[statusId];
  if (key) return translate(locale, key);
  return fallback || STATUS_LABELS[statusId] || translate(locale, "status.fallback", { id: statusId });
}

export function priorityDisplayLabel(
  priorityId: number,
  locale: Locale | string | undefined = DEFAULT_LOCALE
): string {
  const key = PRIORITY_MESSAGE[priorityId];
  return key ? translate(locale, key) : String(priorityId);
}

export function presenceDisplayLabel(
  status: PresenceStatus,
  locale: Locale | string | undefined = DEFAULT_LOCALE,
  variant: "full" | "pill" = "full"
): string {
  if (variant === "full" && status === "home") {
    return translate(locale, "presence.homeOffice");
  }
  return translate(locale, PRESENCE_PILL_MESSAGE[status] ?? PRESENCE_MESSAGE[status]);
}

export function organizationDisplayLabel(
  org: UserOrganization,
  locale: Locale | string | undefined = DEFAULT_LOCALE
): string {
  return translate(locale, ORG_MESSAGE[org]);
}

export function notifyReasonDisplayLabel(
  reason: NotifyReason,
  locale: Locale | string | undefined = DEFAULT_LOCALE
): string {
  return translate(locale, NOTIFY_MESSAGE[reason]);
}

export function activityEventDisplayLabel(
  event: string,
  locale: Locale | string | undefined = DEFAULT_LOCALE
): string {
  const key = ACTIVITY_MESSAGE[event as ActivityEventValue];
  return key ? translate(locale, key) : event;
}

export function icsTypeDisplayLabel(
  type: string,
  locale: Locale | string | undefined = DEFAULT_LOCALE,
  fallback?: string
): string {
  const key = ICS_TYPE_MESSAGE[type as IcsCalendarType];
  return key ? translate(locale, key) : fallback || type;
}

export function timeBucketDisplayTitle(
  id: TimeBucketId,
  locale: Locale | string | undefined,
  preset?: TimeBucketPreset
): string {
  if (id === "overdue" && preset === "deadlines") {
    return translate(locale, "buckets.expired");
  }
  if (id === "overdue" && preset === "warranties") {
    return translate(locale, "buckets.lapsed");
  }
  return translate(locale, BUCKET_MESSAGE[id]);
}

export function weatherCodeDisplayLabel(
  code: number,
  locale: Locale | string | undefined = DEFAULT_LOCALE
): string {
  const key = WEATHER_CODE_MESSAGE[code];
  return key
    ? translate(locale, key)
    : translate(locale, "weather.code.unknown", { code });
}

export function windDirectionDisplayLabel(
  degrees: number,
  locale: Locale | string | undefined = DEFAULT_LOCALE
): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  const key = WIND_KEYS[index] ?? "N";
  return translate(locale, `weather.wind.${key}` as MessageKey);
}

export function greetingWord(locale: Locale | string | undefined = DEFAULT_LOCALE): string {
  const hour = new Date().getHours();
  const loc = parseLocale(locale);
  if (hour < 11) return translate(loc, "home.greetingMorning");
  if (hour < 18) return translate(loc, "home.greetingDay");
  return translate(loc, "home.greetingEvening");
}
