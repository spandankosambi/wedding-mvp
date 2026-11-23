/* Runs once when a server starts, before it handles requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { env, envProblems } = await import("./config/env");

  // a live server says at once if a setting is missing, rather than failing later
  if (process.env.NODE_ENV === "production") {
    for (const p of envProblems()) console.error(`[settings] ${p}`);
  }

  // the live database (Neon); locally, `npm run seed` applies drizzle/ itself
  if (!env.databaseUrl) return;
  const { withRetry } = await import("./lib/retry");
  const { ensureColumns, scrubSamplePhone } = await import("./db/ensure");
  // each step on its own, retried through a slow first connection, so one failing doesn't skip the next
  for (const [label, step] of [["ensureColumns", ensureColumns], ["scrubSamplePhone", scrubSamplePhone]] as const) {
    try {
      await withRetry(step, { label });
    } catch (e) {
      console.error(`[startup] ${label} failed`, e);
    }
  }
}
