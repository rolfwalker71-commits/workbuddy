"use client";

import { PublicHolidayChips } from "@/components/holidays/public-holiday-chips";
import { useLocale } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type {
  PublicHolidayCountry,
  PublicHolidayItem,
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
  layout?: "stack" | "inline";
  className?: string;
}) {
  const { locale } = useLocale();
  const rows = rowsFrom(items, countries, titles);
  if (rows.length === 0) return null;

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
