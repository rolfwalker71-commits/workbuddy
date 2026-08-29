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
