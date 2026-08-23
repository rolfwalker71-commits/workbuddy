import { getSetting, setSetting } from "@/lib/db/migrations";
import type { HomeWeatherCard } from "@/lib/weather/fetch";

export type HomeKpiCache = {
  microsoftUnread: number | null;
  googleUnread: number | null;
  weather: HomeWeatherCard | null;
};

function unreadKey(userId: number) {
  return `home_unread_json_u${userId}`;
}

function weatherKey(userId: number | null) {
  return userId != null ? `home_weather_json_u${userId}` : "home_weather_json";
}

function readJson<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readHomeKpiCache(userId: number | null): HomeKpiCache {
  const unread =
    userId != null
      ? readJson<{ microsoftUnread?: number | null; googleUnread?: number | null }>(
          unreadKey(userId),
          {}
        )
      : {};
  return {
    microsoftUnread:
      typeof unread.microsoftUnread === "number" ? unread.microsoftUnread : null,
    googleUnread:
      typeof unread.googleUnread === "number" ? unread.googleUnread : null,
    weather: readJson<HomeWeatherCard | null>(weatherKey(userId), null),
  };
}

export function writeHomeUnreadCache(
  userId: number,
  next: { microsoftUnread?: number | null; googleUnread?: number | null }
): void {
  const prev = readJson<{
    microsoftUnread?: number | null;
    googleUnread?: number | null;
  }>(unreadKey(userId), {});
  setSetting(
    unreadKey(userId),
    JSON.stringify({
      microsoftUnread:
        next.microsoftUnread !== undefined
          ? next.microsoftUnread
          : prev.microsoftUnread ?? null,
      googleUnread:
        next.googleUnread !== undefined
          ? next.googleUnread
          : prev.googleUnread ?? null,
    })
  );
}

export function writeHomeWeatherCache(
  userId: number | null,
  weather: HomeWeatherCard
): void {
  setSetting(weatherKey(userId), JSON.stringify(weather));
}
