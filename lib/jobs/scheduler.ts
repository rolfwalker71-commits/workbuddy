import { JOB_LEASE_MS } from "./constants";
import { recoverExpiredJobLeases } from "./queries";

type SchedulerState = {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
  lastTickAt: string | null;
  nextTickAt: string | null;
  lastResult: string | null;
};

const globalKey = "__workbuddy_scheduler__";
const POLL_MS = 15_000;
const TICK_MS = 10 * 60 * 1000;

function getState(): SchedulerState {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: SchedulerState;
  };
  if (!g[globalKey]) {
    g[globalKey] = {
      started: false,
      timer: null,
      running: false,
      lastTickAt: null,
      nextTickAt: null,
      lastResult: null,
    };
  }
  return g[globalKey]!;
}

async function tick(): Promise<void> {
  const state = getState();
  if (state.running) return;
  state.running = true;
  state.lastTickAt = new Date().toISOString();
  try {
    const { syncMariTicketsIfDue } = await import(
      "@/lib/mari/sync-tickets-if-due"
    );
    const mariSync = await syncMariTicketsIfDue().catch((error) => {
      console.warn("[scheduler] maringo tickets:", error);
      return null;
    });
    if (mariSync?.attempted) {
      state.lastResult = `mari:t${mariSync.ticketCount ?? 0}/c${mariSync.changeCount ?? 0}`;
    } else {
      state.lastResult = `mari:${mariSync?.reason ?? "idle"}`;
    }
    const { syncOofPresenceIfDue } = await import("@/lib/presence/oof-sync");
    const oofSync = await syncOofPresenceIfDue().catch((error) => {
      console.warn("[scheduler] presence oof:", error);
      return null;
    });
    if (oofSync) {
      state.lastResult += ` oof:${oofSync.applied}/${oofSync.cleared}`;
    }
    const { maybeDispatchEveningClose } = await import(
      "@/lib/dashboard/evening-close-push"
    );
    const evening = await maybeDispatchEveningClose().catch((error) => {
      console.warn("[scheduler] evening close:", error);
      return null;
    });
    if (evening) {
      state.lastResult += ` evening:${evening.sent}/${evening.skipped}`;
    }
    try {
      const { expireOpenSessions, pruneOlderThan } = await import(
        "@/lib/users/activity-log"
      );
      expireOpenSessions();
      pruneOlderThan();
    } catch (error) {
      console.warn("[scheduler] activity log:", error);
    }
  } catch (error) {
    state.lastResult = error instanceof Error ? error.message : String(error);
  } finally {
    state.running = false;
    state.nextTickAt = new Date(Date.now() + TICK_MS).toISOString();
  }
}

export function startScheduler(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  try {
    recoverExpiredJobLeases(new Date(Date.now() + JOB_LEASE_MS + 1));
  } catch (error) {
    console.error("[workbuddy] Failed to recover job leases:", error);
  }

  state.nextTickAt = new Date(Date.now() + 20_000).toISOString();

  const check = () => {
    try {
      const now = Date.now();
      const dueAt = state.nextTickAt
        ? new Date(state.nextTickAt).getTime()
        : Number.POSITIVE_INFINITY;
      if (now >= dueAt && !state.running) {
        void tick();
      }
    } catch (error) {
      console.error("[workbuddy] Scheduler tick check failed:", error);
    }
  };

  state.timer = setInterval(check, POLL_MS);
  if (typeof state.timer.unref === "function") {
    state.timer.unref();
  }
  check();
}

export function getSchedulerRuntimeStatus() {
  const state = getState();
  return {
    started: state.started,
    ticking: state.running,
    lastTickAt: state.lastTickAt,
    nextTickAt: state.nextTickAt,
    lastResult: state.lastResult,
  };
}

export function rescheduleFromNow(): void {
  const state = getState();
  state.nextTickAt = new Date(Date.now() + 2_000).toISOString();
}
