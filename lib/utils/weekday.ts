export function weekdayShortDe(iso: string): string {
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("de-CH", {
      weekday: "short",
      timeZone: "Europe/Zurich",
    });
  } catch {
    return iso;
  }
}

export function weekdayLabel(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("de-CH", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}
