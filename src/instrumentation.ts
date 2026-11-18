/* Runs once when a server starts, before it handles requests. */
export async function register() {
  // the live database (Neon); locally, `npm run seed` applies drizzle/ itself
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { ensureColumns } = await import("./db/ensure");
    await ensureColumns();
  } catch (e) {
    console.error("ensureColumns failed", e);
  }
}
