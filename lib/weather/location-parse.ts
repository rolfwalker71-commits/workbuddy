export type WeatherHomeLocation = {
  query: string;
  label: string;
  lat: number;
  lon: number;
};

export const DEFAULT_WEATHER_HOME: WeatherHomeLocation = {
  query: "Altdorf UR",
  label: "Altdorf",
  lat: 46.88042,
  lon: 8.64345,
};

export function weatherHomeSettingKey(userId: number): string {
  return `weather_home_u${userId}`;
}

export function parseWeatherHomeJson(raw: string | null): WeatherHomeLocation {
  if (!raw) return { ...DEFAULT_WEATHER_HOME };
  try {
    const parsed = JSON.parse(raw) as Partial<WeatherHomeLocation>;
    const lat = Number(parsed.lat);
    const lon = Number(parsed.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { ...DEFAULT_WEATHER_HOME };
    }
    return {
      query: String(parsed.query || parsed.label || DEFAULT_WEATHER_HOME.query),
      label: String(parsed.label || parsed.query || DEFAULT_WEATHER_HOME.label),
      lat,
      lon,
    };
  } catch {
    return { ...DEFAULT_WEATHER_HOME };
  }
}
