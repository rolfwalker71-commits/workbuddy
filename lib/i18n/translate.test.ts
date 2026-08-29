import assert from "node:assert/strict";
import test from "node:test";
import { catalogs } from "./catalogs.ts";
import { LOCALES } from "./locales.ts";
import { translate } from "./translate.ts";

function keysOf(tree: unknown, prefix = ""): string[] {
  if (typeof tree === "string") return [prefix];
  if (!tree || typeof tree !== "object") return [];
  return Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key)
  );
}

test("every locale catalog has the same keys as German", () => {
  const deKeys = keysOf(catalogs.de).sort();
  for (const locale of LOCALES) {
    if (locale === "de") continue;
    assert.deepEqual(keysOf(catalogs[locale]).sort(), deKeys, locale);
  }
});

test("interpolate replaces placeholders without touching unknown braces", () => {
  assert.equal(
    translate("de", "home.unreadMails", { count: 3, caption: "Outlook" }),
    "3 ungelesene Outlook-Mails"
  );
  assert.equal(
    translate("en", "home.unreadMails", { count: 3, caption: "Outlook" }),
    "3 unread Outlook mail"
  );
  assert.equal(translate("de", "nav.overview"), "Übersicht");
  assert.equal(translate("en", "nav.overview"), "Overview");
});
