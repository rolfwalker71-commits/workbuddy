import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { ALL_STATUS_IDS, WORK_STATUS_IDS } from "@/lib/mari/status";
import { normalizeMariEmployeeNumber } from "@/lib/mari/tickets";

export const MARI_TICKET_SAVED_VIEWS_MAX = 8;

export type MariTicketSavedView = {
  id: string;
  label: string;
  handledBy: string[];
  statuses: number[];
  overdueOnly: boolean;
  showOnHome: boolean;
};

const KEY_PREFIX = "mari_ticket_saved_views:";

function settingKey(ownerKey: string): string {
  return `${KEY_PREFIX}${ownerKey}`;
}

function sanitizeStatuses(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...WORK_STATUS_IDS];
  const allowed = new Set<number>(ALL_STATUS_IDS);
  const out = [
    ...new Set(
      raw
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && allowed.has(n))
    ),
  ].sort((a, b) => a - b);
  return out.length > 0 ? out : [...WORK_STATUS_IDS];
}

function sanitizeHandledBy(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((v) => normalizeMariEmployeeNumber(typeof v === "string" ? v : null))
        .filter((n): n is string => n != null)
    ),
  ].slice(0, 40);
}

function sanitizeLabel(raw: unknown): string {
  const label = typeof raw === "string" ? raw.trim().slice(0, 60) : "";
  return label || "Sicht";
}

function newViewId(): string {
  return randomBytes(8).toString("hex");
}

export function parseMariTicketSavedView(
  raw: unknown
): MariTicketSavedView | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const handledBy = sanitizeHandledBy(o.handledBy);
  if (handledBy.length === 0) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newViewId();
  return {
    id,
    label: sanitizeLabel(o.label),
    handledBy,
    statuses: sanitizeStatuses(o.statuses),
    overdueOnly: Boolean(o.overdueOnly),
    showOnHome: o.showOnHome !== false,
  };
}

export function listMariTicketSavedViews(
  ownerKey: string
): MariTicketSavedView[] {
  const raw = getSetting(settingKey(ownerKey));
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [];
    const out: MariTicketSavedView[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const view = parseMariTicketSavedView(row);
      if (!view || seen.has(view.id)) continue;
      seen.add(view.id);
      out.push(view);
      if (out.length >= MARI_TICKET_SAVED_VIEWS_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

function persist(
  ownerKey: string,
  views: MariTicketSavedView[]
): MariTicketSavedView[] {
  const next = views.slice(0, MARI_TICKET_SAVED_VIEWS_MAX);
  setSetting(settingKey(ownerKey), JSON.stringify(next));
  return next;
}

export function createMariTicketSavedView(
  ownerKey: string,
  input: {
    label?: unknown;
    handledBy?: unknown;
    statuses?: unknown;
    overdueOnly?: unknown;
    showOnHome?: unknown;
  }
): MariTicketSavedView {
  const current = listMariTicketSavedViews(ownerKey);
  if (current.length >= MARI_TICKET_SAVED_VIEWS_MAX) {
    throw new Error(
      `Höchstens ${MARI_TICKET_SAVED_VIEWS_MAX} gespeicherte Sichten.`
    );
  }
  const view = parseMariTicketSavedView({
    id: newViewId(),
    label: input.label,
    handledBy: input.handledBy,
    statuses: input.statuses,
    overdueOnly: input.overdueOnly,
    showOnHome: input.showOnHome,
  });
  if (!view) {
    throw new Error("Mindestens einen Bearbeiter wählen.");
  }
  persist(ownerKey, [...current, view]);
  return view;
}

export function updateMariTicketSavedView(
  ownerKey: string,
  id: string,
  input: {
    label?: unknown;
    handledBy?: unknown;
    statuses?: unknown;
    overdueOnly?: unknown;
    showOnHome?: unknown;
  }
): MariTicketSavedView | null {
  const current = listMariTicketSavedViews(ownerKey);
  const idx = current.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const prev = current[idx]!;
  const next = parseMariTicketSavedView({
    ...prev,
    ...input,
    id: prev.id,
    handledBy: input.handledBy !== undefined ? input.handledBy : prev.handledBy,
    statuses: input.statuses !== undefined ? input.statuses : prev.statuses,
  });
  if (!next) throw new Error("Mindestens einen Bearbeiter wählen.");
  const views = [...current];
  views[idx] = next;
  persist(ownerKey, views);
  return next;
}

export function deleteMariTicketSavedView(
  ownerKey: string,
  id: string
): boolean {
  const current = listMariTicketSavedViews(ownerKey);
  const next = current.filter((v) => v.id !== id);
  if (next.length === current.length) return false;
  persist(ownerKey, next);
  return true;
}

export function mariTicketSavedViewHref(view: MariTicketSavedView): string {
  const q = new URLSearchParams();
  q.set("handledBy", view.handledBy.join(","));
  q.set("status", view.statuses.join(","));
  if (view.overdueOnly) q.set("overdue", "1");
  return `/maringo?${q.toString()}`;
}
