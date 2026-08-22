export const JOB_LEASE_MS = 45 * 60 * 1000;
export const JOB_TYPE_WORKBUDDY_TICK = "workbuddy_tick";

export function jobTypeLabel(jobType: string): string {
  if (jobType === JOB_TYPE_WORKBUDDY_TICK) return "WorkBuddy Tick";
  return jobType;
}
