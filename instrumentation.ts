export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { preferIpv4Dns } = await import("./lib/net/outbound-fetch");
    preferIpv4Dns();
    try {
      const { startScheduler } = await import("./lib/jobs/scheduler");
      startScheduler();
    } catch (error) {
      console.error("[workbuddy] Scheduler failed to start:", error);
    }
  }
}
