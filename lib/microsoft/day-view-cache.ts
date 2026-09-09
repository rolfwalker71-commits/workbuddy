/**
 * Short-lived cache for the Microsoft day views.
 *
 * Both `calendar/today` and `mail/today` were re-fetched on every page visit
 * and every tab switch — measured over one day: 32 calendar calls averaging
 * 1.8s and 23 mail calls averaging 3.9s, all for data that had not changed.
 * Every one of them also queues behind the 2-wide per-user Graph gate, so the
 * repeats slowed the rest of the app down too.
 *
 * Writers must invalidate: a day view that hides a booking the user just made
 * would be worse than a slow one. See invalidateMicrosoftDayViews.
 */

import { createTtlCache } from "@/lib/utils/ttl-cache";

const DAY_VIEW_TTL_MS = 60_000;

export type MicrosoftDayView = "calendar" | "mail" | "home";

const caches: Record<MicrosoftDayView, ReturnType<typeof createTtlCache<unknown>>> = {
  calendar: createTtlCache<unknown>(DAY_VIEW_TTL_MS),
  mail: createTtlCache<unknown>(DAY_VIEW_TTL_MS),
  /** /api/home/details — calendar, mail, Planner, To Do, Teams and Maringo. */
  home: createTtlCache<unknown>(DAY_VIEW_TTL_MS),
};

function cacheKey(userId: number, day: string): string {
  return `u${userId}:${day}`;
}

export function getCachedDayView<T>(
  view: MicrosoftDayView,
  userId: number,
  day: string
): T | undefined {
  return caches[view].get(cacheKey(userId, day)) as T | undefined;
}

export function setCachedDayView(
  view: MicrosoftDayView,
  userId: number,
  day: string,
  payload: unknown
): void {
  caches[view].set(cacheKey(userId, day), payload);
}

/**
 * Call after anything that changes what a day view would show: marking an
 * event done, moving it, booking hours, pinning a project mapping.
 */
export function invalidateMicrosoftDayViews(userId: number | null): void {
  if (userId == null) return;
  const prefix = `u${userId}:`;
  caches.calendar.invalidatePrefix(prefix);
  caches.mail.invalidatePrefix(prefix);
  caches.home.invalidatePrefix(prefix);
}
