import type { PresenceSource, PresenceStatus } from "@/lib/presence/status";

export type PresenceLayer = {
  status: PresenceStatus;
  source: PresenceSource;
  setByUserId: number | null;
  note: string | null;
  updatedAt: string;
};

/**
 * Highest wins: deputy override → O365 OOO → own plan/click → default week → unset.
 */
export function resolveDayStatus(input: {
  deputy?: PresenceLayer | null;
  oof?: PresenceLayer | null;
  self?: PresenceLayer | null;
  default?: PresenceLayer | null;
}): PresenceLayer | null {
  return input.deputy || input.oof || input.self || input.default || null;
}

export function layersFromStored(row: PresenceLayer | null): {
  deputy: PresenceLayer | null;
  oof: PresenceLayer | null;
  self: PresenceLayer | null;
  default: PresenceLayer | null;
} {
  if (!row) {
    return { deputy: null, oof: null, self: null, default: null };
  }
  if (row.source === "deputy") {
    return { deputy: row, oof: null, self: null, default: null };
  }
  if (row.source === "oof") {
    return { deputy: null, oof: row, self: null, default: null };
  }
  if (row.source === "default") {
    return { deputy: null, oof: null, self: null, default: row };
  }
  return { deputy: null, oof: null, self: row, default: null };
}

export function resolveStoredDayStatus(
  row: PresenceLayer | null
): PresenceLayer | null {
  return resolveDayStatus(layersFromStored(row));
}
