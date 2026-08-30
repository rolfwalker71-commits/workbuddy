export const PRESENCE_STATUSES = [
  "office",
  "home",
  "sick",
  "vacation",
  "absent",
] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const PRESENCE_STATUS_LABELS: Record<PresenceStatus, string> = {
  office: "Büro",
  home: "Home Office",
  sick: "Krank",
  vacation: "Frei / Ferien",
  absent: "Abwesend",
};

export const PRESENCE_SOURCES = [
  "self",
  "deputy",
  "oof",
  "vacationCal",
  "default",
] as const;

export type PresenceSource = (typeof PRESENCE_SOURCES)[number];

const PROTECTED_SOURCES = new Set<PresenceSource>([
  "deputy",
  "oof",
  "vacationCal",
]);

export function isPresenceStatus(raw: unknown): raw is PresenceStatus {
  return (
    raw === "office" ||
    raw === "home" ||
    raw === "sick" ||
    raw === "vacation" ||
    raw === "absent"
  );
}

export function parsePresenceStatus(raw: unknown): PresenceStatus | null {
  return isPresenceStatus(raw) ? raw : null;
}

export function isPresenceSource(raw: unknown): raw is PresenceSource {
  return (
    raw === "self" ||
    raw === "deputy" ||
    raw === "oof" ||
    raw === "vacationCal" ||
    raw === "default"
  );
}

export function parsePresenceSource(raw: unknown): PresenceSource | null {
  return isPresenceSource(raw) ? raw : null;
}

/** Self-writes must not replace a deputy override or Outlook OOO. */
export function isProtectedPresenceSource(
  source: PresenceSource | null | undefined
): boolean {
  return source != null && PROTECTED_SOURCES.has(source);
}

const SELF_STATUSES_OOF_KEEPS = new Set<PresenceStatus>(["sick", "vacation"]);

/**
 * O365 OOO must not replace a deputy override or a self sick/vacation day.
 * Office / home / absent (self) and an existing oof row may be overwritten.
 */
export function oofMustNotOverwrite(existing: {
  source: PresenceSource;
  status: PresenceStatus;
} | null): boolean {
  if (!existing) return false;
  if (existing.source === "deputy" || existing.source === "vacationCal") {
    return true;
  }
  return (
    existing.source === "self" && SELF_STATUSES_OOF_KEEPS.has(existing.status)
  );
}

/** Company vacation calendar must not replace deputy or self sick/vacation. */
export function vacationCalMustNotOverwrite(existing: {
  source: PresenceSource;
  status: PresenceStatus;
} | null): boolean {
  if (!existing) return false;
  if (existing.source === "deputy") return true;
  return (
    existing.source === "self" && SELF_STATUSES_OOF_KEEPS.has(existing.status)
  );
}
