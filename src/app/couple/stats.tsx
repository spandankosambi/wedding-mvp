import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { families, guests, rsvps } from "@/db/schema";
import { getRsvpSummary } from "@/lib/rsvp";
import type { FamilySide } from "@/lib/looks";

/** The numbers the dashboard and each family's section show. */
export async function weddingStats(weddingId: string, side?: FamilySide) {
  const fams = await db.select().from(families)
    .where(side ? and(eq(families.weddingId, weddingId), eq(families.side, side)) : eq(families.weddingId, weddingId))
    .orderBy(families.createdAt);
  const ids = fams.map((f) => f.id);
  const [allGuests, allRsvps] = ids.length
    ? await Promise.all([
        db.select().from(guests).where(inArray(guests.familyId, ids)).orderBy(guests.seq),
        db.select().from(rsvps).where(inArray(rsvps.familyId, ids)),
      ])
    : [[], []];
  const responded = new Set(allRsvps.map((r) => r.familyId));
  const summary = await getRsvpSummary(weddingId, side);
  return {
    families: fams,
    guests: allGuests,
    summary,
    respondedCount: responded.size,
    responseRate: fams.length ? Math.round((responded.size / fams.length) * 100) : 0,
    peak: summary.reduce((m, s) => Math.max(m, s.attendingHeadcount), 0),
    nonResponders: fams.filter((f) => !responded.has(f.id)),
  };
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="portal-panel p-4">
      <p className="portal-stat-label">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
