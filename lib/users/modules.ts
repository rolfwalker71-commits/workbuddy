/** App modules that can be granted to non-admin users. */
export const APP_MODULES = ["microsoft", "maringo", "google"] as const;

export type AppModule = (typeof APP_MODULES)[number];

export const ALL_APP_MODULES: AppModule[] = [...APP_MODULES];

export function isAppModule(value: string): value is AppModule {
  return (APP_MODULES as readonly string[]).includes(value);
}

export function normalizeAppModules(raw: unknown): AppModule[] {
  if (!Array.isArray(raw)) return [];
  const out: AppModule[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase();
    if (isAppModule(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Login / redirect home: slim module overview, or Konto if nothing is granted. */
export function homePathForModules(modules: readonly AppModule[]): string {
  if (modules.length > 0) return "/";
  return "/account";
}
