/**
 * Overview / Ablauf only: hide timed today-events after end + 30 min.
 * All-day / untimed items stay until 23:59 Europe/Zurich.
 * Do not use on the Kalender tab — that list keeps the full day until
 * Tagesabschluss (calendar today APIs, no grace filter).
 */

export const EVENT_PAST_GRACE_MINUTES = 30;

export type TimedAgendaLike = {
  date: string;
  time?: string | null;
  startHm?: string | null;
  endTime?: string | null;
  endHm?: string | null;
  isAllDay?: boolean;
};

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function startHmOf(item: TimedAgendaLike): string | null {
  if (item.isAllDay === true) return null;
  return item.time ?? item.startHm ?? null;
}

function endHmOf(item: TimedAgendaLike): string | null {
  if (item.isAllDay === true) return null;
  return item.endTime ?? item.endHm ?? null;
}

function eventWindowMinutes(
  item: TimedAgendaLike
): { start: number; end: number } | null {
  const startHm = startHmOf(item);
  if (!startHm) return null;
  const start = hmToMinutes(startHm);
  if (start == null) return null;
  const end = endHmOf(item) ? hmToMinutes(endHmOf(item)!) : null;
  return { start, end: end != null && end > start ? end : start + 60 };
}

/** Past after end + grace. All-day (no time) stay until end of day. */
export function isAgendaItemPastGrace(
  item: TimedAgendaLike,
  today: string,
  nowHm: string,
  graceMinutes = EVENT_PAST_GRACE_MINUTES
): boolean {
  if (item.date > today) return false;
  if (item.date < today) return true;
  const w = eventWindowMinutes(item);
  if (!w) {
    const now = hmToMinutes(nowHm) ?? 0;
    return now >= 24 * 60 - 1;
  }
  const now = hmToMinutes(nowHm) ?? 0;
  return now >= w.end + graceMinutes;
}

/** Today's remaining items, plus the first later-day item (Ablauf). */
export function filterAblaufTimelineItems<T extends TimedAgendaLike>(
  items: T[],
  today: string,
  nowHm: string,
  graceMinutes = EVENT_PAST_GRACE_MINUTES
): T[] {
  const kept = items.filter(
    (item) => !isAgendaItemPastGrace(item, today, nowHm, graceMinutes)
  );
  const todayItems = kept.filter((i) => i.date === today);
  const later = kept
    .filter((i) => i.date > today)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (startHmOf(a) || "99:99").localeCompare(startHmOf(b) || "99:99")
    );
  const firstTomorrow = later[0] ? [later[0]] : [];
  return [...todayItems, ...firstTomorrow].sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    return (startHmOf(a) || "99:99").localeCompare(startHmOf(b) || "99:99");
  });
}

/** Home / Übersicht today lists: drop items that already passed end + grace. */
export function filterTodayEventsAfterGrace<T extends TimedAgendaLike>(
  items: T[],
  today: string,
  nowHm: string,
  graceMinutes = EVENT_PAST_GRACE_MINUTES
): T[] {
  return items.filter(
    (item) => !isAgendaItemPastGrace(item, today, nowHm, graceMinutes)
  );
}
