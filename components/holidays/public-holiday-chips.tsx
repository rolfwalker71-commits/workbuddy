import { CountryFlag } from "@/components/branding/country-flag";
import { cn } from "@/lib/utils";
import type { PublicHolidayCountry } from "@/lib/presence/public-holidays-shared";

export function PublicHolidayChips({
  countries,
  titles,
  className,
  locale = "de",
}: {
  countries: readonly PublicHolidayCountry[];
  titles?: readonly string[];
  className?: string;
  locale?: string;
}) {
  const hint = (titles || []).filter(Boolean).join(" · ") || countries.join(" · ");
  if (countries.length === 0 && !hint) return null;
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-0.5", className)}
      title={hint}
      aria-label={hint || countries.join(" · ")}
    >
      {countries.length > 0 ? (
        countries.map((code) => (
          <CountryFlag
            key={code}
            code={code}
            locale={locale}
            size="row"
            decorative
          />
        ))
      ) : (
        <span className="inline-flex min-h-6 min-w-7 items-center justify-center rounded-full bg-violet-100 px-1.5 text-[0.7rem] font-bold leading-none text-violet-950 dark:bg-violet-500/25 dark:text-violet-50">
          FT
        </span>
      )}
    </span>
  );
}
