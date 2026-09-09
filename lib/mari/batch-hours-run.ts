/**
 * Progress of one batch booking. Pure, so partial failure and retry are
 * testable: a run keeps going after a failed row, and a row that already
 * produced a Maringo line is never booked twice.
 */

export type BatchRowStatus = "pending" | "running" | "booked" | "failed";

export type BatchRowState = {
  status: BatchRowStatus;
  error: string | null;
  lineId: number | null;
  /** The Outlook ✅ is a separate call and may fail on its own. */
  stampedDone: boolean;
  /** Line is in Maringo, but a follow-up step did not go through. */
  warning: string | null;
};

export type BatchRunState = {
  order: string[];
  byId: Record<string, BatchRowState>;
  running: boolean;
};

export type BatchRunProgress = {
  total: number;
  finished: number;
  booked: number;
  failed: number;
  percent: number;
};

export function startBatchRun(
  eventIds: readonly string[],
  previous?: BatchRunState | null
): BatchRunState {
  const byId: Record<string, BatchRowState> = {};
  for (const id of eventIds) {
    const before = previous?.byId[id];
    // Keep a booked row booked — a retry must not send it again.
    byId[id] =
      before?.status === "booked"
        ? before
        : {
            status: "pending",
            error: null,
            lineId: null,
            stampedDone: false,
            warning: null,
          };
  }
  return { order: [...eventIds], byId, running: true };
}

function patch(
  state: BatchRunState,
  eventId: string,
  next: Partial<BatchRowState>
): BatchRunState {
  const before = state.byId[eventId];
  if (!before) return state;
  return {
    ...state,
    byId: { ...state.byId, [eventId]: { ...before, ...next } },
  };
}

export function markRowRunning(
  state: BatchRunState,
  eventId: string
): BatchRunState {
  return patch(state, eventId, { status: "running", error: null });
}

/**
 * Once Maringo has the line the row counts as booked, even if stamping or the
 * Outlook ✅ failed — anything else would invite a double booking on retry.
 */
export function markRowBooked(
  state: BatchRunState,
  eventId: string,
  lineId: number | null,
  stampedDone: boolean,
  warning: string | null = null
): BatchRunState {
  return patch(state, eventId, {
    status: "booked",
    error: null,
    lineId,
    stampedDone,
    warning,
  });
}

export function markRowFailed(
  state: BatchRunState,
  eventId: string,
  error: string
): BatchRunState {
  return patch(state, eventId, { status: "failed", error });
}

export function finishBatchRun(state: BatchRunState): BatchRunState {
  return { ...state, running: false };
}

/** Rows a run still has to send — booked rows are done for good. */
export function batchRunPending(state: BatchRunState): string[] {
  return state.order.filter((id) => state.byId[id]?.status !== "booked");
}

export function batchRunProgress(state: BatchRunState): BatchRunProgress {
  const total = state.order.length;
  let booked = 0;
  let failed = 0;
  for (const id of state.order) {
    const status = state.byId[id]?.status;
    if (status === "booked") booked += 1;
    else if (status === "failed") failed += 1;
  }
  const finished = booked + failed;
  return {
    total,
    finished,
    booked,
    failed,
    percent: total === 0 ? 0 : Math.round((finished / total) * 100),
  };
}

/** Everything went through — the caller may close the dialog. */
export function batchRunFullySucceeded(state: BatchRunState): boolean {
  if (state.order.length === 0) return false;
  return state.order.every((id) => state.byId[id]?.status === "booked");
}
