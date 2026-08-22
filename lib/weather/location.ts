import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  parseWeatherHomeJson,
  weatherHomeSettingKey,
  type WeatherHomeLocation,
} from "./location-parse";

export type { WeatherHomeLocation };
export { parseWeatherHomeJson, weatherHomeSettingKey } from "./location-parse";

export function getWeatherHomeLocation(
  userId: number | null
): WeatherHomeLocation {
  if (userId == null || userId <= 0) {
    return parseWeatherHomeJson(null);
  }
  return parseWeatherHomeJson(getSetting(weatherHomeSettingKey(userId)));
}

export function saveWeatherHomeLocation(
  userId: number,
  loc: WeatherHomeLocation
): void {
  setSetting(weatherHomeSettingKey(userId), JSON.stringify(loc));
}

export function weatherHomePublic(loc: WeatherHomeLocation) {
  return {
    query: loc.query,
    label: loc.label,
    lat: loc.lat,
    lon: loc.lon,
  };
}
