/** Which Microsoft task sources appear in Aufgaben / Home. */

export const MS_TASK_DISPLAY_KEY = "workbuddy.ms-task-display.v1";

export type MsTaskDisplayPrefs = {
  todo: boolean;
  planner: boolean;
};

export function defaultMsTaskDisplayPrefs(): MsTaskDisplayPrefs {
  return { todo: true, planner: true };
}

export function parseMsTaskDisplayPrefs(
  raw: unknown
): MsTaskDisplayPrefs {
  const base = defaultMsTaskDisplayPrefs();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    todo: typeof o.todo === "boolean" ? o.todo : base.todo,
    planner: typeof o.planner === "boolean" ? o.planner : base.planner,
  };
}

export function readMsTaskDisplayPrefs(): MsTaskDisplayPrefs {
  if (typeof window === "undefined") return defaultMsTaskDisplayPrefs();
  try {
    const raw = window.localStorage.getItem(MS_TASK_DISPLAY_KEY);
    if (!raw) return defaultMsTaskDisplayPrefs();
    return parseMsTaskDisplayPrefs(JSON.parse(raw));
  } catch {
    return defaultMsTaskDisplayPrefs();
  }
}

export function writeMsTaskDisplayPrefs(prefs: MsTaskDisplayPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MS_TASK_DISPLAY_KEY, JSON.stringify(prefs));
    window.dispatchEvent(
      new CustomEvent(MS_TASK_DISPLAY_KEY, { detail: prefs })
    );
  } catch {
    /* ignore quota */
  }
}
