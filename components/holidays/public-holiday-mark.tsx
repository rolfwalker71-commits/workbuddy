"use client";

import { PublicHolidayChips } from "@/components/holidays/public-holiday-chips";
import { useLocale } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import {
  PUBLIC_HOLIDAY_COUNTRIES,
  type PublicHolidayCountry,
  type PublicHolidayItem,
} from "@/lib/presence/public-holidays-shared";

function rowsFrom(
  items: readonly PublicHolidayItem[] | undefined,
  countries: readonly PublicHolidayCountry[] | undefined,
  titles: readonly string[] | undefined
): PublicHolidayItem[] {
  if (items && items.length > 0) return [...items];
  const named = (titles || []).map((title) => title.trim()).filter(Boolean);
  if (named.length > 0) {
    return named.map((title, index) => ({
      title,
      countries: index === 0 ? [...(countries || [])] : [],
    }));
  }
  if (countries && countries.length > 0) {
    return [{ title: "", countries: [...countries] }];
  }
  return [];
}

function uniqueCountries(
  items: readonly PublicHolidayItem[],
  countries: readonly PublicHolidayCountry[] | undefined
): PublicHolidayCountry[] {
  const found = new Set<PublicHolidayCountry>();
  for (const code of countries || []) found.add(code);
  for (const row of items) {
    for (const code of row.countries) found.add(code);
  }
  return PUBLIC_HOLIDAY_COUNTRIES.filter((code) => found.has(code));
}

export function PublicHolidayMark({
  countries,
  titles,
  items,
  layout = "stack",
  className,
}: {
  countries?: readonly PublicHolidayCountry[];
  titles?: readonly string[];
  items?: readonly PublicHolidayItem[];
  layout?: "stack" | "inline" | "compact";
  className?: string;
}) {
  const { locale } = useLocale();
  const rows = rowsFrom(items, countries, titles);
  if (rows.length === 0) return null;

  const names = rows.map((row) => row.title.trim()).filter(Boolean);
  const hint = names.join(" · ") || (countries || []).join(" · ");

  if (layout === "compact") {
    const flags = uniqueCountries(rows, countries);
    return (
      <span
        className={cn(
          "flex min-w-0 flex-col items-center gap-0.5 text-center",
          className
        )}
        title={hint}
      >
        <PublicHolidayChips
          countries={flags}
          titles={names}
          locale={locale}
        />
        {names.length > 0 ? (
          <span className="line-clamp-2 text-[0.65rem] font-medium leading-tight text-violet-950 dark:text-violet-50">
            {names.join(" · ")}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex min-w-0",
        layout === "stack" ? "flex-col items-center gap-1" : "flex-col items-start gap-1",
        className
      )}
    >
      {rows.map((row, index) => (
        <span
          key={`${row.title}:${row.countries.join(",")}:${index}`}
          className={cn(
            "flex min-w-0 gap-1",
            layout === "stack"
              ? "flex-col items-center text-center"
              : "flex-wrap items-baseline"
          )}
        >
          <PublicHolidayChips
            countries={row.countries}
            titles={row.title ? [row.title] : titles}
            locale={locale}
          />
          {row.title ? (
            <span
              className={cn(
                "break-words font-medium leading-snug text-violet-950 dark:text-violet-50",
                layout === "stack" ? "text-[0.7rem]" : "text-sm"
              )}
            >
              {row.title}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}
