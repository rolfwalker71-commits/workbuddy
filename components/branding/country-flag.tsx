import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  countryFlagName,
  isCountryFlagCode,
  type CountryFlagCode,
} from "@/lib/i18n/country-flag";
import type { UserOrganization } from "@/lib/users/organization";

const FLAG_CLASS = "h-[1.05em] w-[1.45em] shrink-0";

function FlagSvg({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 21 15"
      className={cn(FLAG_CLASS, className)}
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

function FlagGraphic({
  code,
  label,
  className,
}: {
  code: CountryFlagCode;
  label: string;
  className?: string;
}) {
  switch (code) {
    case "CH":
      return (
        <FlagSvg label={label} className={cn("w-[1.05em]", className)}>
          <rect width="21" height="15" fill="#D52B1E" />
          <rect x="8.7" y="2.4" width="3.6" height="10.2" fill="#fff" />
          <rect x="5.4" y="5.7" width="10.2" height="3.6" fill="#fff" />
        </FlagSvg>
      );
    case "AT":
      return (
        <FlagSvg label={label} className={className}>
          <rect width="21" height="15" fill="#C8102E" />
          <rect y="5" width="21" height="5" fill="#fff" />
        </FlagSvg>
      );
    case "DE":
      return (
        <FlagSvg label={label} className={className}>
          <rect width="21" height="5" fill="#000" />
          <rect y="5" width="21" height="5" fill="#D00" />
          <rect y="10" width="21" height="5" fill="#FFCE00" />
        </FlagSvg>
      );
    case "MX":
      return (
        <FlagSvg label={label} className={className}>
          <rect width="7" height="15" fill="#006847" />
          <rect x="7" width="7" height="15" fill="#fff" />
          <rect x="14" width="7" height="15" fill="#CE1126" />
          <circle cx="10.5" cy="7.5" r="1.55" fill="#C5A100" />
        </FlagSvg>
      );
    case "NP":
      return (
        <FlagSvg label={label} className={className}>
          <rect width="21" height="15" fill="#003893" />
          <path d="M2.2 1.6h11.4L7.8 7.4h9L4.4 13.6V1.6z" fill="#DC143C" />
          <circle cx="7.2" cy="5.1" r="1.15" fill="#fff" />
          <circle cx="8.4" cy="9.7" r="1.35" fill="#fff" />
        </FlagSvg>
      );
  }
}

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
  if (decorative) {
    return (
      <span className="inline-flex" aria-hidden>
        <FlagGraphic code={code} label={label} className={className} />
      </span>
    );
  }
  return <FlagGraphic code={code} label={label} className={className} />;
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
