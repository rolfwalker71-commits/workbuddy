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
