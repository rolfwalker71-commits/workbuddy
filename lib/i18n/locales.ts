/**
 * UI locales. Add a new language by:
 * 1. appending its code here
 * 2. adding a catalog that implements `typeof de`
 * 3. registering it in `catalogs.ts`
 * Identifiers, routes, storage keys, and API fields stay unchanged.
 */
export const LOCALES = ["de", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "de";

export const LOCALE_STORAGE_KEY = "workbuddy.locale";
export const LOCALE_COOKIE = "workbuddy_locale";

/** BCP 47 tags for Intl — Swiss company, English colleagues get en-GB. */
export const INTL_LOCALE: Record<Locale, string> = {
  de: "de-CH",
  en: "en-GB",
};

export const LOCALE_SHORT_LABEL: Record<Locale, string> = {
  de: "DE",
  en: "EN",
};

export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en";
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function intlLocale(locale: Locale = DEFAULT_LOCALE): string {
  return INTL_LOCALE[locale] ?? INTL_LOCALE[DEFAULT_LOCALE];
}
