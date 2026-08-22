import { getDb } from "@/lib/db/client";

export type JobRunRow = {
  id: number;
  job_type: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary_json: string | null;
  error_message: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
};

export type JobRunItemRow = {
  id: number;
  run_id: number;
  item_kind: string;
  external_ref: string | null;
  title: string | null;
  status: string;
  message: string | null;
  payload_json: string | null;
  created_at: string;
};

export function recoverExpiredJobLeases(now = new Date()): number {
  const db = getDb();
  const ts = now.toISOString();
  const result = db
    .prepare(
      `UPDATE job_runs
       SET status = 'error',
           finished_at = ?,
           error_message = COALESCE(error_message, 'Lease abgelaufen (Neustart oder Timeout)')
       WHERE status = 'running'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < ?`
    )
    .run(ts, ts);
  return result.changes;
}

export function listJobRuns(limit = 20, offset = 0): JobRunRow[] {
  return getDb()
    .prepare(`SELECT * FROM job_runs ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as JobRunRow[];
}

export function getJobRunById(id: number): JobRunRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM job_runs WHERE id = ?`)
    .get(id) as JobRunRow | undefined;
  return row ?? null;
}

export function listJobRunItems(runId: number): JobRunItemRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM job_run_items WHERE run_id = ? ORDER BY id`
    )
    .all(runId) as JobRunItemRow[];
}

export function getActiveJobRun(): JobRunRow | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM job_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1`
    )
    .get() as JobRunRow | undefined;
  return row ?? null;
}

export function cancelActiveJobRun(): boolean {
  const active = getActiveJobRun();
  if (!active) return false;
  getDb()
    .prepare(
      `UPDATE job_runs SET status = 'error', finished_at = ?, error_message = 'Abgebrochen' WHERE id = ?`
    )
    .run(new Date().toISOString(), active.id);
  return true;
}
