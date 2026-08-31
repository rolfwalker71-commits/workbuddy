/** Client-safe ICS calendar types/meta (no Node/DB imports). */

export const ICS_CALENDAR_TYPES = [
  "school",
  "birthday",
  "work",
  "holiday",
  "private",
  "other",
] as const;

export type IcsCalendarType = (typeof ICS_CALENDAR_TYPES)[number];

export const ICS_TYPE_META: Record<
  IcsCalendarType,
  { label: string; defaultColor: string; defaultName: string }
> = {
  school: {
    label: "Schule",
    defaultColor: "#2563eb",
    defaultName: "Schule",
  },
  birthday: {
    label: "Geburtstage",
    defaultColor: "#ec4899",
    defaultName: "Geburtstage",
  },
  work: {
    label: "Arbeit",
    defaultColor: "#0f766e",
    defaultName: "Arbeit",
  },
  holiday: {
    label: "Ferien / Feiertage",
    defaultColor: "#8b5cf6",
    defaultName: "Ferien",
  },
  private: {
    label: "Privat",
    defaultColor: "#0369a1",
    defaultName: "Privat",
  },
  other: {
    label: "Sonstiges",
    defaultColor: "#64748b",
    defaultName: "Kalender",
  },
};

const LEGACY_ICS_TYPE_MAP: Record<string, IcsCalendarType> = {
  hockey: "other",
  waste: "other",
  church: "other",
  sports: "other",
  family: "private",
  work_rolf: "work",
  work_valentyna: "work",
};

/** Current picker types, or a mapped leftover from an older assignment. */
export function normalizeIcsCalendarType(
  raw: string | null | undefined
): IcsCalendarType | undefined {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (!t) return undefined;
  if ((ICS_CALENDAR_TYPES as readonly string[]).includes(t)) {
    return t as IcsCalendarType;
  }
  return LEGACY_ICS_TYPE_MAP[t];
}

/** Generic work calendars (person-specific Arbeit-types map here). */
export function isWorkCalendarType(
  type: string | null | undefined
): boolean {
  return normalizeIcsCalendarType(type) === "work";
}
