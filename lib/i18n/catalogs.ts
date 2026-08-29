import type { Locale } from "./locales";
import { de } from "./messages/de";
import { en } from "./messages/en";
import type { MessageTree } from "./messages/types";

export const catalogs: Record<Locale, MessageTree> = {
  de,
  en,
};
