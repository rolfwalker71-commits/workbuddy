import { cn } from "@/lib/utils";
import type { PublicHolidayCountry } from "@/lib/presence/public-holidays-shared";

export function PublicHolidayChips({
  countries,
  titles,
  className,
}: {
  countries: readonly PublicHolidayCountry[];
  titles?: readonly string[];
  className?: string;
}) {
  if (countries.length === 0) return null;
  const hint = (titles || []).filter(Boolean).join(" · ") || countries.join(" · ");
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1", className)}
      title={hint}
      aria-label={hint}
    >
      {countries.map((code) => (
        <span
          key={code}
          className="inline-flex min-h-6 min-w-7 items-center justify-center rounded-full bg-violet-100 px-1.5 text-[0.7rem] font-bold leading-none text-violet-950 dark:bg-violet-500/25 dark:text-violet-50"
        >
          {code}
        </span>
      ))}
    </span>
  );
}
