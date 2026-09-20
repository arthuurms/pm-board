// Runs once when the Next.js server starts. Ticks every minute to generate due scheduled tasks.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runDueScheduledTasks } = await import("./lib/scheduledTasks");
  const tick = () => runDueScheduledTasks().catch((err) => console.error("Scheduled tasks tick failed:", err));

  setInterval(tick, 60_000);
  tick();
}
