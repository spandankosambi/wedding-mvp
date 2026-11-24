import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/*
 * Rate limits, counted in the database so every server sees the same numbers
 * (Vercel runs many copies of the app; a counter in memory only saw its own).
 * One row per key: a fixed window and a count, bumped in a single atomic
 * upsert, so two requests at the same moment can't both slip through.
 */

/** Count one hit on `key`; true while it's within `max` hits per window. */
export async function rateLimit(
  key: string,
  { max = 20, windowMs = 60_000 }: { max?: number; windowMs?: number } = {},
): Promise<boolean> {
  const now = new Date();
  const fresh = sql`${rateLimits.windowStart} <= ${new Date(now.getTime() - windowMs)}`;
  try {
    const [row] = await db.insert(rateLimits).values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        // both read the row as it was: an expired window starts over at 1
        set: {
          count: sql`CASE WHEN ${fresh} THEN 1 ELSE ${rateLimits.count} + 1 END`,
          windowStart: sql`CASE WHEN ${fresh} THEN ${now} ELSE ${rateLimits.windowStart} END`,
        },
      })
      .returning();
    // now and then, forget counters nobody has touched for two days
    if (Math.random() < 0.01) await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 2 * 86_400_000)));
    return row.count <= max;
  } catch (e) {
    // a database hiccup shouldn't lock everyone out; it is logged
    console.error("[ratelimit] counter unavailable:", e instanceof Error ? e.message : e);
    return true;
  }
}

/** Is `key` already over `max` in its current window? Reads only; counts nothing. */
export async function overLimit(key: string, { max = 20, windowMs = 60_000 }: { max?: number; windowMs?: number } = {}): Promise<boolean> {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
  return !!row && row.windowStart.getTime() > Date.now() - windowMs && row.count > max;
}

/**
 * The visitor's IP address. On Vercel these headers are set by Vercel itself
 * and anything a visitor sends in them is overwritten, so they can't be
 * faked; `x-vercel-forwarded-for` stays right even behind another proxy.
 * Locally there's no such header, and everyone is "local".
 */
export function visitorIp(h: { get(name: string): string | null }): string {
  const v = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for");
  return v?.split(",")[0].trim() || "local";
}
