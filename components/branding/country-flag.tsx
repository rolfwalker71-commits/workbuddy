import { cn } from "@/lib/utils";
import {
  countryFlagName,
  isCountryFlagCode,
  type CountryFlagCode,
} from "@/lib/i18n/country-flag";
import type { UserOrganization } from "@/lib/users/organization";

/** Official flag SVGs from Wikimedia Commons (public domain). */
const FLAG_SRC: Record<CountryFlagCode, string> = {
  CH: "/flags/ch.svg",
  AT: "/flags/at.svg",
  DE: "/flags/de.svg",
  MX: "/flags/mx.svg",
  NP: "/flags/np.svg",
};

/** Nepal is a pennant, not a rectangle. CH is square. */
const FLAG_BOX: Record<CountryFlagCode, string> = {
  CH: "h-[0.85em] w-[0.85em]",
  AT: "h-[0.8em] w-[1.2em]",
  DE: "h-[0.8em] w-[1.35em]",
  MX: "h-[0.8em] w-[1.4em]",
  NP: "h-[1.05em] w-[0.86em]",
};

export function CountryFlag({
  code,
  locale = "de",
  decorative = false,
  className,
}: {
  code: string;
  locale?: string;
  decorative?: boolean;
  className?: string;
}) {
  if (!isCountryFlagCode(code)) return null;
  const label = countryFlagName(code, locale);
  return (
    <img
      src={FLAG_SRC[code]}
      alt={decorative ? "" : label}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : label}
      className={cn(
        FLAG_BOX[code],
        "inline-block shrink-0 object-contain object-center",
        className
      )}
    />
  );
}

export function CountryCodeWithFlag({
  code,
  locale = "de",
  className,
}: {
  code: string;
  locale?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <CountryFlag code={code} locale={locale} decorative />
      <span>{code}</span>
    </span>
  );
}

export function OrganizationWithFlag({
  organization,
  label,
  locale = "de",
  className,
}: {
  organization: UserOrganization | string | null | undefined;
  label: string;
  locale?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {organization ? (
        <CountryFlag code={organization} locale={locale} decorative />
      ) : null}
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}
