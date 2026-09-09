export function weekdayShort(iso: string, locale = "de-CH"): string {
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "Europe/Zurich",
    });
  } catch {
    return iso;
  }
}

/** @deprecated Prefer weekdayShort(iso, intlLocale) */
export function weekdayShortDe(iso: string): string {
  return weekdayShort(iso, "de-CH");
}

/** Full weekday under a date, e.g. "Mittwoch" / "Wednesday". */
export function weekdayLong(iso: string, locale = "de-CH"): string {
  try {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    // toLocaleDateString does not throw on an invalid date, it returns the
    // string "Invalid Date" — which would render as-is.
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(locale, {
      weekday: "long",
      timeZone: "Europe/Zurich",
    });
  } catch {
    return "";
  }
}

export function weekdayLabel(iso: string, locale = "de-CH"): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}
