/**
 * Canonical product names for UI, metadata, and mail.
 */
export const BRAND = {
  app: "WorkBuddy",
  microsoft: "Microsoft 365",
  maringo: "Maringo Support",
  google: "Google Workspace",
} as const;

export const BRAND_TAGLINE =
  "Microsoft 365, Google Workspace und Maringo Support — klar getrennt, pro Person.";

/** Inline B-Monogramm (SVG), Sidebar + Login. */
export const BRAND_LOGO_SRC = "/workbuddy-logo.svg";

export function brandTitle(section?: keyof typeof BRAND): string {
  if (!section || section === "app") return BRAND.app;
  return BRAND[section];
}
