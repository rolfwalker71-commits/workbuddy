import type { PublicHolidayCountry } from "@/lib/presence/public-holidays-shared";
import type { UserOrganization } from "@/lib/users/organization";

export const COUNTRY_FLAG_CODES = ["CH", "AT", "DE", "MX", "NP"] as const;

export type CountryFlagCode =
  | UserOrganization
  | PublicHolidayCountry
  | (typeof COUNTRY_FLAG_CODES)[number];

export function isCountryFlagCode(raw: string | null | undefined): raw is CountryFlagCode {
  return (
    raw === "CH" ||
    raw === "AT" ||
    raw === "DE" ||
    raw === "MX" ||
    raw === "NP"
  );
}

const FLAG_NAMES: Record<CountryFlagCode, { de: string; en: string }> = {
  CH: { de: "Schweiz", en: "Switzerland" },
  AT: { de: "Österreich", en: "Austria" },
  DE: { de: "Deutschland", en: "Germany" },
  MX: { de: "Mexiko", en: "Mexico" },
  NP: { de: "Nepal", en: "Nepal" },
};

export function countryFlagName(
  code: CountryFlagCode,
  locale: string | undefined = "de"
): string {
  const row = FLAG_NAMES[code];
  return locale?.startsWith("en") ? row.en : row.de;
}
