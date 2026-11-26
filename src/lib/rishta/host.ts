import { and, count, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rishtaConsents, rishtaInterests, rishtaProfiles, rishtaReports, rishtaSettings } from "@/db/schema";
import { removeProfile, type Profile, type Result } from "@/lib/rishta/profiles";
import { KEEP_DAYS, istToday } from "@/lib/rishta/rules";
import { rateLimit } from "@/lib/auth/ratelimit";

/*
 * What the host (the couple) and the grievance officer (admin) see.
 * The host gets counts and the approval queue, never interests or matches.
 */

/** Counts only. Matches are counted, never named. */
export async function hostCounts(weddingId: string) {
  const rows = await db.select({ status: rishtaProfiles.status, n: count() }).from(rishtaProfiles)
    .where(eq(rishtaProfiles.weddingId, weddingId)).groupBy(rishtaProfiles.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  const [m] = await db.select({ n: count() }).from(rishtaInterests)
    .innerJoin(rishtaProfiles, eq(rishtaProfiles.id, rishtaInterests.fromId))
    .where(and(eq(rishtaProfiles.weddingId, weddingId), sql`exists (select 1 from rishta_interests b where b.from_id = ${rishtaInterests.toId} and b.to_id = ${rishtaInterests.fromId})`));
  return { drafts: by.draft ?? 0, waiting: by.pending ?? 0, live: by.live ?? 0, matches: Math.floor(Number(m?.n ?? 0) / 2) };
}

/** Profiles waiting for the host's look (once each), and the live ones (to remove if needed). */
export async function hostProfiles(weddingId: string): Promise<{ waiting: Profile[]; live: Profile[] }> {
  const rows = await db.select().from(rishtaProfiles)
    .where(and(eq(rishtaProfiles.weddingId, weddingId), inArray(rishtaProfiles.status, ["pending", "live"])))
    .orderBy(rishtaProfiles.publishedAt);
  return { waiting: rows.filter((r) => r.status === "pending" && r.publishedAt), live: rows.filter((r) => r.status === "live") };
}

export async function approve(weddingId: string, id: string, relationOk: boolean): Promise<Result> {
  const [p] = await db.update(rishtaProfiles).set({ status: "live", approvedAt: new Date(), relationApproved: relationOk })
    .where(and(eq(rishtaProfiles.id, id), eq(rishtaProfiles.weddingId, weddingId), eq(rishtaProfiles.status, "pending"))).returning();
  return p ? { ok: true } : { ok: false, error: "That profile isn't waiting for approval." };
}

/** Hide a profile from everyone; the single sees that the hosts removed it. */
export async function hostRemove(weddingId: string, id: string): Promise<Result> {
  const [p] = await db.update(rishtaProfiles).set({ status: "removed" })
    .where(and(eq(rishtaProfiles.id, id), eq(rishtaProfiles.weddingId, weddingId))).returning();
  return p ? { ok: true } : { ok: false, error: "We couldn't find that profile." };
}

/** For the grievance officer (admin): open reports first. */
export async function reportsFor(weddingId: string) {
  return db.select().from(rishtaReports).where(eq(rishtaReports.weddingId, weddingId)).orderBy(sql`${rishtaReports.resolvedAt} is not null`, rishtaReports.at);
}
export async function resolveReport(weddingId: string, id: string): Promise<Result> {
  const [r] = await db.update(rishtaReports).set({ resolvedAt: new Date() })
    .where(and(eq(rishtaReports.id, id), eq(rishtaReports.weddingId, weddingId), isNull(rishtaReports.resolvedAt))).returning();
  return r ? { ok: true } : { ok: false, error: "That report is already resolved." };
}

/**
 * The promise in the notice: when a wedding's window closes, every profile,
 * photo, interest and block goes. Consent records and reports go 180 days
 * later. Safe to run any number of times.
 */
export async function purgeClosed(today = istToday()): Promise<{ profiles: number; records: number }> {
  const closed = await db.select({ weddingId: rishtaSettings.weddingId, closesOn: rishtaSettings.closesOn }).from(rishtaSettings).where(lt(rishtaSettings.closesOn, today));
  let profiles = 0;
  for (const w of closed) {
    const ps = await db.select({ id: rishtaProfiles.id, photos: rishtaProfiles.photos }).from(rishtaProfiles).where(eq(rishtaProfiles.weddingId, w.weddingId));
    for (const p of ps) { await removeProfile(p); profiles += 1; }
  }
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  // by the wedding's current closing date (the host may have moved it), or the one recorded
  const expired = closed.filter((w) => w.closesOn < cutoff).map((w) => w.weddingId);
  const oldC = await db.delete(rishtaConsents)
    .where(expired.length ? or(lt(rishtaConsents.closesOn, cutoff), inArray(rishtaConsents.weddingId, expired)) : lt(rishtaConsents.closesOn, cutoff)).returning();
  const oldR = expired.length ? await db.delete(rishtaReports).where(inArray(rishtaReports.weddingId, expired)).returning() : [];
  return { profiles, records: oldC.length + oldR.length };
}

/** Run the purge at most once an hour, from any Rishta page (the daily cron is the backstop). */
export async function purgeNow(): Promise<void> {
  try {
    if (await rateLimit("rishta-purge", { max: 1, windowMs: 3_600_000 })) await purgeClosed();
  } catch (e) {
    console.error("[rishta purge]", e);
  }
}
