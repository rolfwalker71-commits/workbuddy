export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startScheduler } = await import("./lib/jobs/scheduler");
      startScheduler();
    } catch (error) {
      console.error("[workbuddy] Scheduler failed to start:", error);
    }
  }
}
