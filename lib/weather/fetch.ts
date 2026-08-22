import { weatherCodeLabelDe, weatherConditionIcon } from "./labels";
import { getWeatherHomeLocation } from "./location";

export type HomeWeatherDay = {
  date: string;
  icon: string;
  weatherLabelDe: string;
  temperatureMaxC: number;
  temperatureMinC: number;
};

export type HomeWeatherCard = {
  placeLabel: string;
  temperatureC: number;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  weatherCode: number;
  weatherLabelDe: string;
  icon: string;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  humidityPct: number | null;
  week: HomeWeatherDay[];
};

type DayWeather = {
  date: string;
  temperatureMaxC: number;
  temperatureMinC: number;
  weatherCode: number;
  weatherLabelDe: string;
};

async function fetchCurrent(lat: number, lon: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m"
  );
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "Europe/Zurich");
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "WorkBuddy/1.0 (https://github.com/rolfwalker71-commits/workbuddy)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      relative_humidity_2m?: number;
    };
  };
  const current = data.current;
  if (
    !current ||
    typeof current.temperature_2m !== "number" ||
    typeof current.weather_code !== "number"
  ) {
    throw new Error("Wetterdaten unvollständig.");
  }
  const code = Math.round(current.weather_code);
  return {
    temperatureC: current.temperature_2m,
    weatherCode: code,
    weatherLabelDe: weatherCodeLabelDe(code),
    windSpeedKmh:
      typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
    windDirectionDeg:
      typeof current.wind_direction_10m === "number"
        ? current.wind_direction_10m
        : null,
    humidityPct:
      typeof current.relative_humidity_2m === "number"
        ? current.relative_humidity_2m
        : null,
  };
}

async function fetchWeek(lat: number, lon: number): Promise<DayWeather[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "Europe/Zurich");
  url.searchParams.set("forecast_days", "7");
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "WorkBuddy/1.0 (https://github.com/rolfwalker71-commits/workbuddy)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    daily?: {
      time?: string[];
      weather_code?: (number | null)[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
    };
  };
  const times = data.daily?.time || [];
  const codes = data.daily?.weather_code || [];
  const maxes = data.daily?.temperature_2m_max || [];
  const mins = data.daily?.temperature_2m_min || [];
  const out: DayWeather[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const date = times[i];
    const rawMax = maxes[i];
    const rawMin = mins[i];
    const rawCode = codes[i];
    if (!date || rawMax == null || rawCode == null) continue;
    const code = Math.round(rawCode);
    const tmin =
      rawMin != null && Number.isFinite(rawMin) ? rawMin : rawMax;
    out.push({
      date: date.slice(0, 10),
      temperatureMaxC: rawMax,
      temperatureMinC: tmin,
      weatherCode: code,
      weatherLabelDe: weatherCodeLabelDe(code),
    });
  }
  return out;
}

export async function fetchHomeWeatherCard(
  userId: number | null
): Promise<HomeWeatherCard | null> {
  const loc = getWeatherHomeLocation(userId);
  try {
    const [current, days] = await Promise.all([
      fetchCurrent(loc.lat, loc.lon),
      fetchWeek(loc.lat, loc.lon),
    ]);
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const week = days.filter((d) => d.date >= todayIso).slice(0, 7);
    const today = week.find((d) => d.date === todayIso) || week[0] || null;
    return {
      placeLabel: loc.label,
      temperatureC: Math.round(current.temperatureC),
      temperatureMaxC: today ? Math.round(today.temperatureMaxC) : null,
      temperatureMinC: today ? Math.round(today.temperatureMinC) : null,
      weatherCode: current.weatherCode,
      weatherLabelDe: current.weatherLabelDe,
      icon: weatherConditionIcon(current.weatherCode),
      windSpeedKmh:
        current.windSpeedKmh != null ? Math.round(current.windSpeedKmh) : null,
      windDirectionDeg: current.windDirectionDeg,
      humidityPct:
        current.humidityPct != null ? Math.round(current.humidityPct) : null,
      week: week.map((d) => ({
        date: d.date,
        icon: weatherConditionIcon(d.weatherCode),
        weatherLabelDe: d.weatherLabelDe,
        temperatureMaxC: Math.round(d.temperatureMaxC),
        temperatureMinC: Math.round(d.temperatureMinC),
      })),
    };
  } catch (error) {
    console.warn(
      "[weather] home fetch failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
