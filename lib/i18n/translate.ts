import { catalogs } from "./catalogs";
import {
  DEFAULT_LOCALE,
  type Locale,
  parseLocale,
} from "./locales";
import type { MessageKey, TranslateParams } from "./messages/types";

function lookup(tree: unknown, path: string): unknown {
  let cur: unknown = tree;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function interpolate(
  template: string,
  params?: TranslateParams
): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (all, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return all;
    const value = params[name];
    return value == null ? "" : String(value);
  });
}

export function translate(
  locale: Locale | string | undefined,
  key: MessageKey,
  params?: TranslateParams
): string {
  const loc = parseLocale(locale);
  const raw = lookup(catalogs[loc], key);
  const fallback = loc === DEFAULT_LOCALE ? undefined : lookup(catalogs[DEFAULT_LOCALE], key);
  const template =
    typeof raw === "string"
      ? raw
      : typeof fallback === "string"
        ? fallback
        : key;
  return interpolate(template, params);
}

export function hasMessage(locale: Locale | string | undefined, key: string): boolean {
  return typeof lookup(catalogs[parseLocale(locale)], key) === "string";
}
