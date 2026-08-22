import { weekdayShortDe } from "@/lib/utils/weekday";
import { windDirectionDe } from "@/lib/weather/labels";
import type { HomeWeatherCard } from "@/lib/weather/fetch";
import { cn } from "@/lib/utils";

const WIDGET_CLASS =
  "w-full min-w-0 rounded-2xl border border-border/70 bg-card px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_3px_10px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_14px_rgba(0,0,0,0.28)] sm:px-4 sm:py-3.5";

export function HomeWeatherWidget({
  weather,
}: {
  weather: HomeWeatherCard | null;
}) {
  if (!weather) {
    return (
      <div className={WIDGET_CLASS}>
        <p className="text-sm font-semibold tracking-tight">Wetter</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Wetter derzeit nicht verfügbar.
        </p>
      </div>
    );
  }

  const windDir =
    weather.windDirectionDeg != null && Number.isFinite(weather.windDirectionDeg)
      ? windDirectionDe(weather.windDirectionDeg)
      : null;
  const meta = [
    windDir && weather.windSpeedKmh != null
      ? `${weather.windSpeedKmh} km/h ${windDir}`
      : weather.windSpeedKmh != null
        ? `${weather.windSpeedKmh} km/h`
        : null,
    weather.humidityPct != null ? `${weather.humidityPct} %` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const week = weather.week ?? [];

  return (
    <div className={WIDGET_CLASS}>
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <span className="text-[2.25rem] leading-none" aria-hidden>
            {weather.icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold tracking-tight text-foreground">
                {weather.placeLabel}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {weather.weatherLabelDe}
              </p>
            </div>
            <p className="shrink-0 text-[1.75rem] font-bold tabular-nums leading-none tracking-tight text-foreground">
              {weather.temperatureC}°
            </p>
          </div>
          {weather.temperatureMinC != null || weather.temperatureMaxC != null ? (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              Heute{" "}
              <span className="font-medium text-foreground">
                {weather.temperatureMinC ?? "—"}°
              </span>
              {" – "}
              <span className="font-medium text-foreground">
                {weather.temperatureMaxC ?? "—"}°
              </span>
              {meta ? (
                <span className="text-muted-foreground/80"> · {meta}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {week.length > 0 ? (
        <ul
          className="mt-2.5 grid gap-0.5 border-t border-border/50 pt-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(7, Math.max(1, week.length))}, minmax(0, 1fr))`,
          }}
          aria-label="Wetter Woche"
        >
          {week.map((day, i) => (
            <li
              key={day.date}
              className={cn(
                "flex min-w-0 flex-col items-center rounded-md px-0.5 py-1 text-center",
                i === 0 && "bg-sky-50 dark:bg-sky-500/15"
              )}
              title={`${weekdayShortDe(day.date)}: ${day.weatherLabelDe}, ${day.temperatureMinC}–${day.temperatureMaxC}°`}
            >
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {i === 0 ? "Heute" : weekdayShortDe(day.date)}
              </span>
              <span className="mt-0.5 text-[1.05rem] leading-none" aria-hidden>
                {day.icon}
              </span>
              <span className="mt-1 text-[0.625rem] font-semibold tabular-nums leading-tight text-foreground">
                {day.temperatureMaxC}°
              </span>
              <span className="text-[0.625rem] tabular-nums leading-tight text-muted-foreground">
                {day.temperatureMinC}°
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
