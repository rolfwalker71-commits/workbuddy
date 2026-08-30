import { readResponseJson } from "@/lib/utils/fetch-json";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";
import { organizationDisplayLabel } from "@/lib/i18n/display";
import { type UserOrganization } from "@/lib/users/organization";
import { canDelegatePresence } from "@/lib/presence/delegate";
import {
  isProtectedPresenceSource,
  PRESENCE_STATUS_LABELS,
  type PresenceSource,
  type PresenceStatus,
} from "@/lib/presence/status";

export type PresencePersonView = {
  userId: number;
  displayName: string;
  organization: UserOrganization | null;
  canManagePresence: boolean;
  status: PresenceStatus | null;
  source: PresenceSource | null;
  setByUserId: number | null;
  note: string | null;
  updatedAt: string | null;
};

export type PresenceTodayResponse = {
  ymd: string;
  organization: UserOrganization | null;
  self: PresencePersonView | null;
  people: PresencePersonView[];
};

export type PresenceGroupId = "here" | "away" | "open";

export const PRESENCE_GROUP_LABELS: Record<PresenceGroupId, string> = {
  here: "Da",
  away: "Nicht da",
  open: "Offen",
};

export const PRESENCE_PILL_LABELS: Record<PresenceStatus, string> = {
  office: "Büro",
  home: "Home",
  sick: "Krank",
  vacation: "Frei / Ferien",
  absent: "Abwesend",
};

export const PRESENCE_STATUS_SURFACE: Record<
  PresenceStatus | "unset",
  string
> = {
  office:
    "bg-orange-50 text-orange-950 ring-orange-200/80 dark:bg-orange-500/15 dark:text-orange-100 dark:ring-orange-400/30",
  home: "bg-violet-50 text-violet-950 ring-violet-200/80 dark:bg-violet-500/15 dark:text-violet-100 dark:ring-violet-400/30",
  sick: "bg-rose-50 text-rose-950 ring-rose-200/80 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-400/30",
  vacation:
    "bg-cyan-50 text-cyan-950 ring-cyan-200/80 dark:bg-cyan-500/15 dark:text-cyan-100 dark:ring-cyan-400/30",
  absent:
    "bg-slate-100 text-slate-800 ring-slate-200/80 dark:bg-slate-500/15 dark:text-slate-100 dark:ring-slate-400/30",
  unset: "bg-muted text-muted-foreground ring-foreground/10",
};

export const PRESENCE_STATUS_DOT: Record<PresenceStatus | "unset", string> = {
  office: "bg-orange-500",
  home: "bg-violet-500",
  sick: "bg-rose-500",
  vacation: "bg-cyan-500",
  absent: "bg-slate-500",
  unset: "bg-muted-foreground/50",
};

export const PRESENCE_STATUS_ACTIVE_PILL: Record<PresenceStatus, string> = {
  office:
    "bg-orange-50 text-orange-950 shadow-sm dark:bg-orange-500/20 dark:text-orange-100",
  home: "bg-violet-50 text-violet-950 shadow-sm dark:bg-violet-500/20 dark:text-violet-100",
  sick: "bg-rose-50 text-rose-950 shadow-sm dark:bg-rose-500/20 dark:text-rose-100",
  vacation:
    "bg-cyan-50 text-cyan-950 shadow-sm dark:bg-cyan-500/20 dark:text-cyan-100",
  absent:
    "bg-slate-200 text-slate-900 shadow-sm dark:bg-slate-500/25 dark:text-slate-100",
};

export function presenceGroup(
  status: PresenceStatus | null
): PresenceGroupId {
  if (status == null) return "open";
  if (status === "office" || status === "home") return "here";
  return "away";
}

export function presenceCounts(people: PresencePersonView[]): {
  here: number;
  away: number;
  open: number;
} {
  let here = 0;
  let away = 0;
  let open = 0;
  for (const person of people) {
    const group = presenceGroup(person.status);
    if (group === "here") here += 1;
    else if (group === "away") away += 1;
    else open += 1;
  }
  return { here, away, open };
}

export function groupPresencePeople(people: PresencePersonView[]): Record<
  PresenceGroupId,
  PresencePersonView[]
> {
  const groups: Record<PresenceGroupId, PresencePersonView[]> = {
    here: [],
    away: [],
    open: [],
  };
  for (const person of people) {
    groups[presenceGroup(person.status)].push(person);
  }
  return groups;
}

export function organizationLabel(
  organization: UserOrganization | null,
  locale: Locale = DEFAULT_LOCALE
): string {
  if (!organization) return translate(locale, "presence.noOrganization");
  return organizationDisplayLabel(organization, locale);
}

export function presenceSourceHint(
  source: PresenceSource | null,
  locale: Locale = DEFAULT_LOCALE
): string | null {
  if (source === "oof") return "Outlook";
  if (source === "vacationCal") {
    return translate(locale, "presence.sourceVacationCal");
  }
  if (source === "deputy") return translate(locale, "presence.sourceDeputy");
  if (source === "default") return translate(locale, "presence.sourceDefault");
  return null;
}

export function isOwnDayLocked(source: PresenceSource | null): boolean {
  return isProtectedPresenceSource(source);
}

export function applyLegacyAbsence(
  people: PresencePersonView[],
  awayUserIds: Iterable<number>
): PresencePersonView[] {
  const away = new Set(awayUserIds);
  return people.map((person) => {
    if (person.status != null || !away.has(person.userId)) return person;
    return { ...person, status: "absent" };
  });
}

export function applyLegacyAbsenceSelf(
  self: PresencePersonView | null,
  isAwayToday: boolean
): PresencePersonView | null {
  if (!self || self.status != null || !isAwayToday) return self;
  return { ...self, status: "absent" };
}

export function canManageOthers(actor: {
  isAdmin: boolean;
  canManagePresence: boolean;
}): boolean {
  return actor.isAdmin || actor.canManagePresence;
}

export function canOverridePerson(
  actor: {
    isAdmin: boolean;
    canManagePresence: boolean;
    organization: UserOrganization | null;
  },
  target: { organization: UserOrganization | null }
): boolean {
  return canDelegatePresence(actor, target);
}

export async function fetchPresenceToday(input?: {
  ymd?: string;
  organization?: UserOrganization | "" | null;
}): Promise<PresenceTodayResponse> {
  const params = new URLSearchParams();
  if (input?.ymd) params.set("ymd", input.ymd);
  if (input?.organization) params.set("organization", input.organization);
  const qs = params.toString();
  const res = await fetch(qs ? `/api/presence/today?${qs}` : "/api/presence/today");
  const json = await readResponseJson<PresenceTodayResponse & { error?: string }>(
    res
  );
  if (!res.ok) {
    throw new Error(json.error || "Anwesenheit laden fehlgeschlagen");
  }
  return json;
}

export async function deleteOwnDayStatus(input: {
  ymd: string;
}): Promise<void> {
  const params = new URLSearchParams({ ymd: input.ymd });
  const res = await fetch(`/api/presence/day?${params}`, { method: "DELETE" });
  const json = await readResponseJson<{ error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Abweichung löschen fehlgeschlagen");
  }
}

export async function putOwnDayStatus(input: {
  ymd: string;
  status: PresenceStatus;
}): Promise<void> {
  const res = await fetch("/api/presence/day", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await readResponseJson<{ error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Status speichern fehlgeschlagen");
  }
}

export async function putOwnWeekStatus(input: {
  fromYmd: string;
  days: Array<{ ymd: string; status: PresenceStatus }>;
}): Promise<void> {
  const res = await fetch("/api/presence/week", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await readResponseJson<{ error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Woche speichern fehlgeschlagen");
  }
}

export async function putDelegatedDayStatus(input: {
  userId: number;
  ymd: string;
  status: PresenceStatus;
}): Promise<void> {
  const res = await fetch("/api/presence/delegate", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await readResponseJson<{ error?: string }>(res);
  if (!res.ok) {
    throw new Error(json.error || "Status für Kollege speichern fehlgeschlagen");
  }
}

export { PRESENCE_STATUS_LABELS };
