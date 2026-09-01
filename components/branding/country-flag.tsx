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

/** Nepal is a pennant, not a rectangle. CH is square (no side padding). */
const FLAG_BOX: Record<
  "default" | "row",
  Record<CountryFlagCode, string>
> = {
  default: {
    CH: "h-[0.95em] w-[0.95em]",
    AT: "h-[0.85em] w-[1.25em]",
    DE: "h-[0.85em] w-[1.4em]",
    MX: "h-[0.85em] w-[1.45em]",
    NP: "h-[1.1em] w-[0.9em]",
  },
  row: {
    CH: "h-[1.15em] w-[1.15em]",
    AT: "h-[1.05em] w-[1.55em]",
    DE: "h-[1.05em] w-[1.75em]",
    MX: "h-[1.05em] w-[1.85em]",
    NP: "h-[1.35em] w-[1.1em]",
  },
};

export function CountryFlag({
  code,
  locale = "de",
  decorative = false,
  size = "default",
  className,
}: {
  code: string;
  locale?: string;
  decorative?: boolean;
  size?: "default" | "row";
  className?: string;
}) {
  if (!isCountryFlagCode(code)) return null;
  const label = countryFlagName(code, locale);
  const box = FLAG_BOX[size][code];
  if (code === "CH") {
    return (
      <svg
        viewBox="0 0 32 32"
        className={cn(box, "block shrink-0", className)}
        role={decorative ? undefined : "img"}
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : label}
      >
        <path d="M0 0h32v32H0z" fill="#DA291C" />
        <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" />
      </svg>
    );
  }
  return (
    <img
      src={FLAG_SRC[code]}
      alt={decorative ? "" : label}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : label}
      className={cn(box, "block shrink-0 bg-transparent object-contain", className)}
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
