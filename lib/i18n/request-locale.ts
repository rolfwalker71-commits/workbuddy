import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  parseLocale,
  translate,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "@/lib/i18n";

export async function requestLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    return parseLocale(store.get(LOCALE_COOKIE)?.value);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function tRequest(
  key: MessageKey,
  params?: TranslateParams
): Promise<string> {
  return translate(await requestLocale(), key, params);
}
